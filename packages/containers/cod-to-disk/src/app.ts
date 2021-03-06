import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import * as path from 'path';
import * as fs  from 'fs';
import * as cron from 'node-cron';
import { ExecOptions, ShellString } from "shelljs";
import { Readable, Transform, TransformCallback, Writable } from "stream";

export interface AppContext {
    logger: {
        trace:(message: string) => void;
        info: (message: string) => void;
        error: (message: string) => void;
    },
    exec: (command: string, options?: ExecOptions & { async?: false }) => ShellString;
    execAsync: (command: string) => Readable;
    sendToQueue: (data: object) => void;
}

export interface CodFileRecord {
    fileName: string;
    codId: string;
}

const DATA_PATH = "/home/data/cif";
const FILE_REGEX  = /^\w{1}\s+(([\w\d.\/]+\/(\d+)\.cif))$/i;

let count = 0;
const extractDataFromLogs = new Transform({
    objectMode: true,
    transform: (chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) => {
        const lines = (chunk.toString('utf8'))
            .split("\n")
            .map((line) => {
                const matches = FILE_REGEX.exec(line);
                if (matches) {
                    return  {
                        fileName: path.resolve(DATA_PATH, matches[2]),
                        codId: matches[3],
                    };
                }
              })
              .filter((item) => {
                  return !!item;
            });
        count = count + lines.length;
        callback(null, lines);
    }
});

const getSendMessageToQueueStream = ({ sendToQueue }: AppContext)=> new Writable({
    objectMode: true,
    write: (chunk, _encoding, done) => {
        if (Array.isArray(chunk) && chunk.length >0){
            sendToQueue(chunk);
        }
        done();
    }
});

const checkExistsWithTimeout = (filePath: string, timeout: number): Promise<void> => {
    return new Promise((resolve, reject) => {

        const timer = setTimeout(() => {
            watcher.close();
            reject(new Error('File did not exists and was not created during the timeout.'));
        }, timeout);

        fs.access(filePath, fs.constants.R_OK, (err) => {
            if (!err) {
                clearTimeout(timer);
                watcher.close();
                resolve();
            }
        });

        const dir = path.dirname(filePath);
        const basename = path.basename(filePath);
        const watcher = fs.watch(dir, (eventType, filename) => {
            if (eventType === 'rename' && filename === basename) {
                clearTimeout(timer);
                watcher.close();
                resolve();
            }
        });
    });
}

const waitTillFileExists = new Transform({
    objectMode: true,
    transform: (chunk, _encoding, callback: TransformCallback) => {
        if (Array.isArray(chunk) && chunk.length > 0) {
            const waits = chunk.map(({ fileName, codId })=> {
                return checkExistsWithTimeout(fileName, 15000)
                    .then(() => {
                        return { fileName, codId };
                    })
                    .catch(e => {
                        Sentry.captureException(e);
                        // tslint:disable-next-line
                        console.error(e);
                    })
            });
            Promise.all(waits).then((data)=> {
                callback(null, data);
            });
        } else {
            callback(null, chunk);
        }
    }
});


const fetchDataFromCod = ({ logger, execAsync }: AppContext): Readable => {
    const isFirstStart = !fs.existsSync(DATA_PATH);

    if (isFirstStart) {
        logger.trace('First start: initial fetching data...');
        return execAsync("svn co svn://www.crystallography.net/cod/cif " + DATA_PATH);
    }

    logger.trace('Update SVN data...');
    return execAsync("svn update " + DATA_PATH);
}

const synchronizeData = (context: AppContext) => {
    const { logger } = context;

    return new Promise<void>((resolve)=> {
        fetchDataFromCod(context)
            .pipe(extractDataFromLogs)
            .pipe(waitTillFileExists)
            .pipe(getSendMessageToQueueStream(context))
            .on('error', (e)=> {
                Sentry.captureException(e);
                logger.error(String(e));
            })
            .on('end', ()=> {
                resolve();
            });
    });
}

export const app = async(context: AppContext) => {

    const { logger } = context;

    cron.schedule('00 45 */1 * * *', async () => {
        logger.info('syncronization executed');

        const start = +new Date();
        const transaction = Sentry.startTransaction({
            op: "synchronize",
            name: "Synchronize with COD",
        });

        await synchronizeData(context);
        transaction.finish();

        const end = +new Date();
        logger.info(`synchronized in ${end-start} 'time': ${(end-start)}`);
    });

    logger.info(`subscribed cron events`);

    synchronizeData(context);
}

import tar from 'tar-stream';
import zlib from 'zlib';
import { Readable } from 'stream';
import { CONTAINER_WORKDIR } from '../docker.sandbox.js';

interface DockerContainer {
  getArchive(options: { path: string }): Promise<NodeJS.ReadableStream>;
}

export interface BackupArchive {
  uploadStream: Readable;
  completion: Promise<unknown>;
}

export async function createBackupArchive(container: DockerContainer): Promise<BackupArchive> {
  const tarStream = await container.getArchive({ path: CONTAINER_WORKDIR });
  const extract = tar.extract();
  const pack = tar.pack();
  const gzip = zlib.createGzip();

  extract.on('entry', (header, stream, next) => {
    const relativePath = header.name.replace(/^[^/]+\/?/, '');

    if (!relativePath ||
      relativePath.includes('node_modules/') ||
      relativePath.includes('.next/') ||
      relativePath.startsWith('dist/') ||
      relativePath.startsWith('build/') ||
      relativePath.startsWith('out/') ||
      relativePath.startsWith('.output/') ||
      relativePath.startsWith('preview/') ||
      relativePath.startsWith('previews/')
    ) {
      stream.resume();
      return next();
    }

    const entry = pack.entry(header, next);
    stream.pipe(entry);
  });

  const completion = new Promise((resolve, reject) => {
    extract.on('finish', () => {
      pack.finalize();
      resolve(true);
    });
    extract.on('error', reject);
    pack.on('error', reject);
    gzip.on('error', reject);
  });

  tarStream.pipe(extract);

  return {
    uploadStream: pack.pipe(gzip) as unknown as Readable,
    completion,
  };
}

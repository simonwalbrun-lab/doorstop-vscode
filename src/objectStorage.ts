import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';

import * as vscode from 'vscode';

/**
 * One signed S3 `PUT` (AWS Signature V4), enough for MinIO and other
 * S3-compatible stores (spec 035 research R6). Written over Node built-ins:
 * a single request does not justify an S3 SDK (constitution IV).
 */

export interface SignInput {
  method: string;
  /** Already URI-encoded, as sent. */
  path: string;
  query: string;
  headers: Record<string, string>;
  payloadHash: string;
  accessKey: string;
  secretKey: string;
  region: string;
  /** `YYYYMMDDTHHMMSSZ` */
  amzDate: string;
}

const hmac = (key: crypto.BinaryLike, data: string): Buffer => crypto.createHmac('sha256', key).update(data).digest();

/** The `Authorization` header value for a request signing every header in `headers`. */
export function signV4(input: SignInput): string {
  const headers = new Map(Object.entries(input.headers).map(([name, value]) => [name.toLowerCase(), value.trim()]));
  const names = [...headers.keys()].sort();
  const signedHeaders = names.join(';');
  const canonical = [input.method, input.path, input.query, ...names.map(name => `${name}:${headers.get(name)}`), '', signedHeaders, input.payloadHash].join('\n');
  const date = input.amzDate.slice(0, 8);
  const scope = `${date}/${input.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', input.amzDate, scope, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n');
  const key = ['s3', 'aws4_request'].reduce(hmac, hmac(hmac(`AWS4${input.secretKey}`, date), input.region));
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/** URI encoding as S3 signs it: RFC 3986 unreserved characters stay, everything else is escaped. */
const encodeS3 = (segment: string): string =>
  encodeURIComponent(segment).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** An object key as it appears in a URL path, `/` kept between segments. */
export const encodeKey = (key: string): string => key.split('/').map(encodeS3).join('/');

/** Path-style object URL (MinIO's and Garage's default): `{endpoint}/{bucket}/{key}`. */
function objectUrl(endpoint: string, bucket: string, key: string): URL {
  return new URL(`${endpoint.replace(/\/+$/, '')}/${encodeS3(bucket)}/${encodeKey(key)}`);
}

export interface PutObjectInput {
  endpoint: string;
  bucket: string;
  key: string;
  region: string;
  accessKey: string;
  secretKey: string;
  size: number;
  /** A file path to stream, or the bytes themselves. */
  body: string | Uint8Array;
}

/** Uploads one object and resolves its URL; rejects with `"<status> <S3 error code>"`. */
export function putObject(input: PutObjectInput, token: vscode.CancellationToken): Promise<string> {
  // shortcut: single PUT caps objects at 5 GiB, switch to multipart upload if evidence files get that big
  const url = objectUrl(input.endpoint, input.bucket, input.key);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const headers = { host: url.host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amzDate };
  const authorization = signV4({ ...input, method: 'PUT', path: url.pathname, query: '', headers, payloadHash: 'UNSIGNED-PAYLOAD', amzDate });
  return new Promise((resolve, reject) => {
    if (token.isCancellationRequested) {
      reject(new vscode.CancellationError());
      return;
    }
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'PUT',
      headers: { ...headers, 'content-length': input.size, authorization }
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        if (status >= 200 && status < 300) {
          resolve(url.toString());
        } else {
          const body = Buffer.concat(chunks).toString();
          const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? response.statusMessage ?? '';
          // S3's own explanation, e.g. MinIO's "S3 API Requests must be made to API port." for the console port.
          const message = /<Message>([^<]+)<\/Message>/.exec(body)?.[1];
          reject(new Error(`${status} ${code}`.trim() + (message ? `: ${message}` : '')));
        }
      });
    });
    const cancellation = token.onCancellationRequested(() => request.destroy(new vscode.CancellationError()));
    request.on('close', () => cancellation.dispose());
    request.on('error', reject);
    if (typeof input.body === 'string') {
      fs.createReadStream(input.body).on('error', error => request.destroy(error)).pipe(request);
    } else {
      request.end(input.body);
    }
  });
}

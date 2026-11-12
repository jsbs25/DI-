/**
 * Storage adapter contract (scaffold) for R2-backed files.
 *
 * Goals: replace local fs paths (server_data/uploads, avatars, books) without
 * changing access control semantics. Private objects MUST NOT be public; all
 * reads/writes go through authenticated/authorized handlers that validate
 * ownership or conversation membership (same rules as server.ts today).
 */

export type FileVisibility = 'private' | 'conversation' | 'avatar-public';

export interface PutObjectInput {
  key: string;
  body: ReadableStream | ArrayBuffer | Uint8Array | string;
  contentType?: string;
  size?: number;
  ownerId?: string;
  conversationId?: string;
  visibility: FileVisibility;
  metadata?: Record<string, string>;
}

export interface StoredObjectMeta {
  key: string;
  contentType?: string;
  size?: number;
  etag?: string;
  uploadedAt: string;
}

export interface StorageAdapter {
  put(input: PutObjectInput): Promise<StoredObjectMeta>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
}

export class R2StorageAdapter implements StorageAdapter {
  constructor(private readonly bucket: R2Bucket) {}

  async put(input: PutObjectInput): Promise<StoredObjectMeta> {
    await this.bucket.put(input.key, input.body, {
      httpMetadata: input.contentType ? { contentType: input.contentType } : undefined,
      customMetadata: {
        ownerId: input.ownerId || '',
        conversationId: input.conversationId || '',
        visibility: input.visibility,
        ...(input.metadata || {}),
      },
    });
    const head = await this.bucket.head(input.key);
    return {
      key: input.key,
      contentType: head?.httpMetadata?.contentType || input.contentType,
      size: head?.size ?? input.size,
      etag: head?.etag,
      uploadedAt: head?.uploaded.toISOString() || new Date().toISOString(),
    };
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }

  async head(key: string): Promise<R2Object | null> {
    return this.bucket.head(key);
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

// Key helpers preserve traceability to existing IDs/paths without exposing raw fs layout.
export const keys = {
  attachment: (ownerId: string, attachmentId: string, safeName: string) =>
    `uploads/${ownerId}/${attachmentId}_${safeName}`,
  attachmentMeta: (attachmentId: string) => `uploads/meta/${attachmentId}.json`,
  avatar: (userId: string, fileName: string) => `avatars/${userId}/${fileName}`,
  bookContent: (bookId: string) => `books/content/${bookId}.json`,
};

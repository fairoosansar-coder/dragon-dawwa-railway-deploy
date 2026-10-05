declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    EDITORIAL_OWNER_ID?: string;
    EDITORIAL_ROLES?: string;
  }
}

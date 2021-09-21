import { isLeft } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import { Router } from 'itty-router';

const router = Router({ base: '/foundernft' });
export { router as founderNftRouter };

export interface FounderNftRequest {
  walletId: string;
  twitter: string;
  discord: string;
}
router.get(':id', async (req, env: Env) => {
  if (!req.params) {
    return new Response('', { status: 404 });
  }
  const addr = env.FOUNDER_NFT.idFromName(req.params.id);
  const obj = env.FOUNDER_NFT.get(addr);
  return obj.fetch(req.url);
});

export class FounderNft {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private founderNft: FounderNftRequest | null;
  private codec: t.Type<FounderNftRequest>;
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.founderNft = null;
    this.codec = t.strict({
      walletId: t.string,
      twitter: t.string,
      discord: t.string
    });
    this.router = Router()
      .get('*', async () => {
        if (this.founderNft) {
          return new Response(JSON.stringify(this.founderNft));
        }
        return new Response('', { status: 404 });
      })
      .put('*', async req => {
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const json: unknown = await req.json();
        const decoded = this.codec.decode(json);
        if (isLeft(decoded)) {
          return new Response(JSON.stringify(decoded.left), { status: 400 });
        }
        const founderNft = decoded.right;
        console.log('FOUNDER NFT', JSON.stringify(founderNft, undefined, 2));
        this.state.storage.put('founderNft', founderNft);
        return new Response('', { status: 204 });
      });
  }

  async initialize(): Promise<void> {
    this.founderNft = await this.state.storage.get('founderNft');
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.initializePromise) {
      this.initializePromise = this.initialize().catch(err => {
        this.initializePromise = undefined;
        throw err;
      });
    }
    await this.initializePromise;

    return this.router.handle(request);
  }
}

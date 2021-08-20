import { isLeft } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import { Router } from 'itty-router';

const router = Router({ base: '/users' });
export { router as usersRouter };

router
  .get('/:id', async (req, env: Env) => {
    if (!req.params) {
      return new Response('', { status: 404 });
    }
    const id = env.USERS.idFromName(req.params.id);
    const obj = env.USERS.get(id);
    const resp = await obj.fetch(req.url);
    const user = await resp.text();
    return new Response(user);
  })
  .put('/:id', async (req, env: Env) => {
    if (!req.params || !req.text) {
      return new Response('', { status: 400 });
    }
    const id = env.USERS.idFromName(req.params.id);
    const obj = env.USERS.get(id);
    try {
      return obj.fetch(req.url, {
        method: 'PUT',
        body: await req.text()
      });
    } catch (err) {
      return new Response(`An error occured: ${err}`, { status: 400 });
    }
  });

export class Users {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private user: User | null;
  private userCodec: t.Type<User>;
  private userCodecJson: string;
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.user = null;
    this.userCodec = t.exact(t.interface({ name: t.string }));
    this.userCodecJson = JSON.stringify(this.userCodec);
    this.router = Router()
      .get('*', async () => {
        if (this.user) {
          return new Response(JSON.stringify(this.user));
        } else {
          return new Response('', { status: 404 });
        }
      })
      .put('*', async req => {
        if (!req.text) {
          return new Response('', { status: 400 });
        }
        const text: string = await req.text();
        const user = this.userCodec.decode(text);
        if (isLeft(user)) {
          return new Response(
            `Bad body data:\n${JSON.stringify(user.left)}\n\nCodec:\n${
              this.userCodecJson
            }`,
            {
              status: 400
            }
          );
        }
        this.user = user.right;
        await this.state.storage.put<User>('.', this.user);
        return new Response('', { status: 204 });
      });
  }

  async initialize(): Promise<void> {
    this.user = await this.state.storage.get<User | null>('.');
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

// import { isLeft, Either, left } from 'fp-ts/lib/Either';
// import * as t from 'io-ts';
// import { PathReporter } from 'io-ts/PathReporter';
// import { Router, Request } from 'itty-router';

// const router = Router({ base: '/airdrop' });
// export { router as airdropRouter };

// interface AirdropRequest {
//   walletId: string;
//   twitter: string;
//   discord: string;
//   quiz: Quiz;
// }

// interface Quiz {
//   platform: string;
// }

// const quizAnswers = JSON.stringify({
//   platform: 'web'
// } as Quiz).toLowerCase();

// enum AirdropRequestHeaders {
//   FounderId = 'Founder-ID'
// }

// interface DiscordMember {
//   joined_at: string;
//   user: {
//     id: string;
//     username: string;
//     discriminator: string;
//     avatar: string;
//   };
// }

// class AirdropResponse {
//   static put(
//     res: Either<PutAirdropErrorResponse, PutAirdropOkResponse>
//   ): Response {
//     if (isLeft(res)) {
//       return new Response(JSON.stringify(res.left), { status: 400 });
//     }
//     return new Response(res.right.message, { status: res.right.status });
//   }
// }

// interface PutAirdropOkResponse {
//   status: number;
//   message: string;
// }

// interface PutAirdropErrorResponse {
//   code: PutAirdropErrorResponseCode;
//   message?: string;
// }

// enum PutAirdropErrorResponseCode {
//   CodecError = 1,
//   AlreadyExists = 2,
//   QuizAnswerWrong = 3,
//   NoDiscordMember = 4
// }

// router
//   .get('/:addr', async (req, env: Env) => {
//     if (!req.params) {
//       return new Response('', { status: 404 });
//     }
//     const addr = env.AIRDROP.idFromName(req.params.addr);
//     const obj = env.AIRDROP.get(addr);
//     return obj.fetch(req.url);
//   })
//   .put('/:addr', async (req, env: Env) => {
//     if (!req.params || !req.text) {
//       return new Response('', { status: 400 });
//     }
//     const addr = env.AIRDROP.idFromName(req.params.addr);
//     const airdropObj = env.AIRDROP.get(addr);
//     try {
//       const founderId = env.FOUNDER_NFT.newUniqueId();

//       // const addr = env.TWITTER.idFromName('A');
//       // console.log('addr', addr);
//       // const twitterObj = env.TWITTER.get(addr);
//       // console.log('obj', twitterObj);
//       // const origin = new URL(req.url).origin;
//       // console.log('FETCH TWITTER FOLLOWS', `${origin}/follows/marior.near`);
//       // await twitterObj.fetch(req.url);
//       // await twitterObj.fetch(`${origin}/follows/marior.near`);

//       let res = await airdropObj.fetch(req.url, {
//         method: 'PUT',
//         body: await req.text(),
//         headers: {
//           [AirdropRequestHeaders.FounderId]: founderId.toString()
//         }
//       });
//       if (!res.ok) {
//         return res;
//       }
//       const airdrop = await res.text();

//       const founderNftObj = env.FOUNDER_NFT.get(founderId);
//       res = await founderNftObj.fetch(req.url, {
//         method: 'PUT',
//         body: airdrop
//       });
//       return new Response(founderId.toString());
//     } catch (err) {
//       return new Response(`An unknown error occured: ${err}`, { status: 500 });
//     }
//   })
//   .delete('/:addr', async (req, env: Env) => {
//     if (!req.params) {
//       return new Response('', { status: 404 });
//     }
//     const addr = env.AIRDROP.idFromName(req.params.addr);
//     const obj = env.AIRDROP.get(addr);
//     return obj.fetch(req.url, { method: 'DELETE' });
//   });

// export class Airdrop {
//   private state: DurableObjectState;
//   private initializePromise: Promise<void> | undefined;
//   private founderId: string | null;
//   private codec: t.Type<AirdropRequest>;
//   private router: Router<unknown>;

//   constructor(state: DurableObjectState, env: Env) {
//     this.state = state;
//     this.founderId = null;
//     this.codec = t.type({
//       walletId: t.string,
//       twitter: t.string,
//       discord: t.string,
//       quiz: t.interface({
//         platform: t.string
//       })
//     });
//     this.router = Router()
//       .get('*', () => {
//         if (this.founderId) {
//           return new Response(this.founderId);
//         }
//         return new Response('', { status: 404 });
//       })
//       .put('*', async req => {
//         if (this.founderId) {
//           return AirdropResponse.put(
//             left({
//               code: PutAirdropErrorResponseCode.AlreadyExists,
//               message: this.founderId
//             })
//           );
//         }
//         if (!req.json) {
//           return new Response('', { status: 400 });
//         }
//         const json: unknown = await req.json();
//         const decoded = this.codec.decode(json);
//         if (isLeft(decoded)) {
//           return AirdropResponse.put(
//             left({
//               code: PutAirdropErrorResponseCode.CodecError,
//               message: PathReporter.report(decoded).join('\n\n')
//             })
//           );
//         }
//         const airdrop = decoded.right;
//         console.log(JSON.stringify(airdrop, undefined, 2));
//         const { discord, twitter, quiz } = airdrop;

//         const quizError = await this.checkQuizAnswers(quiz);
//         if (quizError) {
//           return quizError;
//         }

//         const twitterFollowError = await this.checkTwitterFollow(
//           twitter,
//           req.url,
//           env
//         );
//         if (twitterFollowError) {
//           return twitterFollowError;
//         }
//         const twitterLikeError = await this.checkTwitterLike(twitter);
//         if (twitterLikeError) {
//           return twitterLikeError;
//         }
//         const twitterRetweetError = await this.checkTwitterRetweet(twitter);
//         if (twitterRetweetError) {
//           return twitterRetweetError;
//         }

//         const discordError = await this.checkDiscordMembership(discord, env);
//         if (discordError) {
//           return discordError;
//         }

//         this.founderId = (req as any).headers.get(
//           AirdropRequestHeaders.FounderId
//         ); // TODO fix typings in itty-router
//         await this.state.storage.put('founderId', this.founderId);
//         return new Response(JSON.stringify(airdrop), { status: 200 });
//       })
//       .delete('*', async () => {
//         if (this.founderId) {
//           await this.state.storage.get('founderId');
//           this.founderId = null;
//           return new Response('', { status: 204 });
//         }
//         return new Response('', { status: 404 });
//       });
//   }

//   /**
//    * Check quiz answers
//    * @returns Response on error, undefined on success
//    */
//   async checkQuizAnswers(quiz: Quiz): Promise<Response | undefined> {
//     if (JSON.stringify(quiz).toLowerCase() !== quizAnswers) {
//       return AirdropResponse.put(
//         left({ code: PutAirdropErrorResponseCode.QuizAnswerWrong })
//       );
//     }
//   }

//   /**
//    * Check Twitter folloiw
//    * @returns Response on error, undefined on success
//    */
//   async checkTwitterFollow(
//     username: string,
//     url: string,
//     env: Env
//   ): Promise<Response | undefined> {
//     const addr = env.TWITTER.idFromName('.');
//     const twitterObj = env.TWITTER.get(addr);
//     const origin = new URL(url).origin;
//     console.log('FETCH TWITTER FOLLOWS', `${origin}/follows/${username}`);
//     const res = await twitterObj.fetch(`${origin}/follows/${username}`);
//     // const res = await twitterObj.fetch(`${origin}/follows/${username}`);
//     console.log('FETCH TWITTER FOLLOWS RES', JSON.stringify(res, undefined, 2));
//     if (!res.ok) {
//       return res;
//     }
//     return;
//   }

//   /**
//    * Check Twitter like
//    * @returns Response on error, undefined on success
//    */
//   async checkTwitterLike(twitterHandle: string): Promise<Response | undefined> {
//     // TODO
//     return;
//   }

//   /**
//    * Check Twitter retweet
//    * @returns Response on error, undefined on success
//    */
//   async checkTwitterRetweet(
//     twitterHandle: string
//   ): Promise<Response | undefined> {
//     // TODO
//     return;
//   }

//   /**
//    * Check Discord membership
//    * @returns Response on error, undefined on success
//    */
//   async checkDiscordMembership(
//     discordHandle: string,
//     env: Env
//   ): Promise<Response | undefined> {
//     const res = await fetch(
//       `https://discord.com/api/guilds/168893527357521920/members/search?query=${discordHandle}`,
//       {
//         headers: {
//           Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
//         }
//       }
//     );
//     if (!res.ok) {
//       console.error(`Discord says no: [${res.status}]`);
//       return res;
//     }
//     const discordMembers: DiscordMember[] = await res.json();
//     console.info('DISCORD OK', JSON.stringify(discordMembers, undefined, 2));
//     const [username, discriminator] = discordHandle.split('#');
//     const discordMember = discordMembers.find(
//       ({ user }) =>
//         user.username === username && user.discriminator === discriminator
//     );
//     if (!discordMember) {
//       return AirdropResponse.put(
//         left({ code: PutAirdropErrorResponseCode.NoDiscordMember })
//       );
//     }
//   }

//   async initialize(): Promise<void> {
//     this.founderId = await this.state.storage.get('founderId');
//   }

//   async fetch(request: Request): Promise<Response> {
//     if (!this.initializePromise) {
//       this.initializePromise = this.initialize().catch(err => {
//         this.initializePromise = undefined;
//         throw err;
//       });
//     }
//     await this.initializePromise;

//     return this.router.handle(request);
//   }
// }

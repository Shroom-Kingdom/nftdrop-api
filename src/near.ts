// import { connect, WalletConnection } from 'near-api-js';
import { KeyStore } from 'near-api-js/lib/key_stores';
import { KeyPair } from 'near-api-js/lib/utils';

export async function nearLogin(env: Env): Promise<void> {
  // const config = {
  //   networkId: 'testnet',
  //   keyStore: new BasicKeyStore(env),
  //   nodeUrl: 'https://rpc.testnet.near.org',
  //   walletUrl: 'https://wallet.testnet.near.org',
  //   helperUrl: 'https://helper.testnet.near.org',
  //   explorerUrl: 'https://explorer.testnet.near.org',
  //   headers: {}
  // };
  // const near = await connect(config);
  // const wallet = new WalletConnection(near, null);
  // const walletAccountObj = wallet.account();
  // console.log('walletAccountObj', walletAccountObj);
}

class BasicKeyStore implements KeyStore {
  constructor(env: Env) {
    KeyPair.fromString(env.NEAR_KEY_PAIR);
  }
  setKey(
    networkId: string,
    accountId: string,
    keyPair: KeyPair
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getKey(networkId: string, accountId: string): Promise<KeyPair> {
    throw new Error('Method not implemented.');
  }
  removeKey(networkId: string, accountId: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  clear(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getNetworks(): Promise<string[]> {
    throw new Error('Method not implemented.');
  }
  getAccounts(networkId: string): Promise<string[]> {
    throw new Error('Method not implemented.');
  }
}
// class BasicKeyStore implements KeyStore {
//   private keyPair: KeyPair;
//   constructor(env: Env) {
//     this.keyPair = KeyPair.fromString(env.NEAR_KEY_PAIR);
//   }
//   async setKey(): Promise<void> {}
//   async getKey(networkId: string, accountId: string): Promise<KeyPair> {
//     return this.keyPair;
//   }
//   removeKey(networkId: string, accountId: string): Promise<void> {
//     throw new Error('Method not implemented.');
//   }
//   clear(): Promise<void> {
//     throw new Error('Method not implemented.');
//   }
//   async getNetworks(): Promise<string[]> {
//     return ['testnet'];
//   }
//   async getAccounts(networkId: string): Promise<string[]> {
//     return ['nft.shrm.testnet'];
//   }
// }

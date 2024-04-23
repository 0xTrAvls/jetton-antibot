
import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano, internal as internal_relaxed, storeMessageRelaxed } from '@ton/core';
import { Dictionary } from '@ton/core';
import { Op } from './Constants';
import { Sha256 } from '@aws-crypto/sha256-js';

export const SNAKE_PREFIX = 0x00;
export const ONCHAIN_CONTENT_PREFIX = 0x00;
export const OFFCHAIN_CONTENT_PREFIX = 0x01;

export const sha256 = (str: string) => {
    const sha = new Sha256();
    sha.update(str);
    return Buffer.from(sha.digestSync());
  };

function bufferToChunks(buff: Buffer, chunkSize: number) {
    const chunks: Buffer[] = [];
    while (buff.byteLength > 0) {
      chunks.push(buff.slice(0, chunkSize));
      buff = buff.slice(chunkSize);
    }
    return chunks;
  }
  
  export const toKey = (key: string) => {
    return BigInt(`0x${sha256(key).toString('hex')}`);
  };
  
  export function makeSnakeCell(data: Buffer) {
    // Create a cell that package the data
    const CELL_MAX_SIZE_BYTES = Math.floor((1023 - 8) / 8);
    const chunks = bufferToChunks(data, CELL_MAX_SIZE_BYTES);
  
    const b = chunks.reduceRight((curCell, chunk, index) => {
      if (index === 0) {
        curCell.storeInt(SNAKE_PREFIX, 8);
      }
      curCell.storeBuffer(chunk);
      if (index > 0) {
        const cell = curCell.endCell();
        return beginCell().storeRef(cell);
      }
      return curCell;
    }, beginCell());
    return b.endCell();
  }

  export function buildJettonOnchainMetadata(data: { [s: string]: string }): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
  
    // Store the on-chain metadata in the dictionary
    Object.entries(data).forEach(([key, value]) => {
      dict.set(toKey(key), makeSnakeCell(Buffer.from(value, 'utf8')));
    });
  
    return beginCell().storeInt(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
  }

export const randomAddress = (wc: number = 0) => {
    const buf = Buffer.alloc(32);
    for (let i = 0; i < buf.length; i++) {
        buf[i] = Math.floor(Math.random() * 256);
    }
    return new Address(wc, buf);
};

export const differentAddress = (old: Address) => {
    let newAddr: Address;
    do {
        newAddr = randomAddress(old.workChain);
    } while(newAddr.equals(old));

    return newAddr;
}

const getRandom = (min:number, max:number) => {
    return Math.random() * (max - min) + min;
}

export const getRandomInt = (min: number, max: number) => {
    return Math.round(getRandom(min, max));
}

export const getRandomTon = (min:number, max:number): bigint => {
    return toNano(getRandom(min, max).toFixed(9));
}

export type InternalTransfer = {
    from: Address | null,
    response: Address | null,
    amount: bigint,
    forwardAmount: bigint,
    payload: Cell | null
};
export type JettonTransfer = {
    to: Address,
    response_address: Address | null,
    amount: bigint,
    custom_payload: Cell | null,
    forward_amount: bigint,
    forward_payload: Cell | null
}

export const parseTransfer = (body: Cell) => {
    const ts = body.beginParse().skip(64 + 32);
    return {
        amount: ts.loadCoins(),
        to: ts.loadAddress(),
        response_address: ts.loadAddressAny(),
        custom_payload: ts.loadMaybeRef(),
        forward_amount: ts.loadCoins(),
        forward_payload: ts.loadMaybeRef()
    }
}
export const parseInternalTransfer = (body: Cell) => {

    const ts = body.beginParse().skip(64 + 32);

    return {
        amount: ts.loadCoins(),
        from: ts.loadAddressAny(),
        response: ts.loadAddressAny(),
        forwardAmount: ts.loadCoins(),
        payload: ts.loadMaybeRef()
    };
};
type JettonTransferNotification = {
    amount: bigint,
    from: Address | null,
    payload: Cell | null
}
export const parseTransferNotification = (body: Cell) => {
    const bs = body.beginParse().skip(64 + 32);
    return {
        amount: bs.loadCoins(),
        from: bs.loadAddressAny(),
        payload: bs.loadMaybeRef()
    }
}

type JettonBurnNotification = {
    amount: bigint,
    from: Address,
    response_address: Address | null,
}
export const parseBurnNotification = (body: Cell) => {
    const ds  = body.beginParse().skip(64 + 32);
    const res = {
        amount: ds.loadCoins(),
        from: ds.loadAddress(),
        response_address: ds.loadAddressAny(),
    };

    return res;
}

const testPartial = (cmp: any, match: any) => {
    for (let key in match) {
        if(!(key in cmp)) {
            throw Error(`Unknown key ${key} in ${cmp}`);
        }

        if(match[key] instanceof Address) {
            if(!(cmp[key] instanceof Address)) {
                return false
            }
            if(!(match[key] as Address).equals(cmp[key])) {
                return false
            }
        }
        else if(match[key] instanceof Cell) {
            if(!(cmp[key] instanceof Cell)) {
                return false;
            }
            if(!(match[key] as Cell).equals(cmp[key])) {
                return false;
            }
        }
        else if(match[key] !== cmp[key]){
            return false;
        }
    }
    return true;
}
export const testJettonBurnNotification = (body: Cell, match: Partial<JettonBurnNotification>) => {
    const res= parseBurnNotification(body);
    return testPartial(res, match);
}

export const testJettonTransfer = (body: Cell, match: Partial<JettonTransfer>) => {
    const res = parseTransfer(body);
    return testPartial(res, match);
}
export const testJettonInternalTransfer = (body: Cell, match: Partial<InternalTransfer>) => {
    const res = parseInternalTransfer(body);
    return testPartial(res, match);
};
export const testJettonNotification = (body: Cell, match: Partial<JettonTransferNotification>) => {
    const res = parseTransferNotification(body);
    return testPartial(res, match);
}

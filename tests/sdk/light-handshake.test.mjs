import test from 'node:test';
import assert from 'node:assert/strict';
import {createLightClient,defineNetwork} from '../../dist/src/index.js';
import {revision,scalar,bytesField,concat,blockBytes,tipBytes} from '../clients/light-chain-reads-fixtures.mjs';
const text=(n,s)=>bytesField(n,new TextEncoder().encode(s));
const genesis=Uint8Array.from({length:32},(_,i)=>i);
const network=await defineNetwork({identity:'synthetic',genesisHash:Buffer.from(genesis).reverse().toString('hex'),parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode('{"encoding":"main","Overwinter":10,"Sapling":20,"Blossom":30,"Heartwood":40,"Canopy":50,"Nu5":60,"Nu6":70,"Nu6_1":80,"Nu6_2":90,"Nu6_3":100}')});
test('light handshake uses block 1 ancestry and requires successful stream completion',async()=>{
  for(const mode of ['good','wrong-genesis','empty','trailing-error']){
    let streams=0,tips=0;
    const client=createLightClient({network,transport:{kind:'custom-lightwallet',sourceId:'synthetic',protocolRevision:revision,
      async unary({method}){
        if(method==='GetLightdInfo')return concat(text(4,'main'),scalar(5,20),text(6,'76b809bb'),scalar(7,20),text(18,'v0.5.0'));
        if(method==='GetLatestBlock'){tips++;return tipBytes(20);}
        throw Error('genesis tree is unsupported');
      },
      async *stream({method,request}){
        streams++;assert.equal(method,'GetBlockRange');assert.deepEqual([...request],[10,2,8,1,18,2,8,1]);
        if(mode==='empty')return;
        yield blockBytes(1,undefined,mode==='wrong-genesis'?new Uint8Array(32):genesis);
        if(mode==='trailing-error')throw Error('stream failed after block');
      }
    }});
    if(mode==='good'){assert.equal((await client.getTip()).height,20);await client.getTip();assert.equal(streams,1);assert.equal(tips,2);}
    else{await assert.rejects(client.getTip(),{code:mode==='wrong-genesis'?'NETWORK_MISMATCH':mode==='empty'?'PROTOCOL_MISMATCH':'TRANSPORT_ERROR'});assert.equal(tips,0);}
  }
});

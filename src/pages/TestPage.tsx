import { testFunction } from '../lib/transaction';

export default function TestPage() {
  const handleTest = async () => {
    const rawPsbtHex =
      '0400008085202f8901ce95a8755ce00f9093bce5cf842181bd2df80ec47119736176a5446c28608117010000006a47304402205cfe5a1792dfb132c1a6e9c166841d3b5f7c02304c90590ce6f75c127434fb2902205ba2eb6ff222ba4612f219fa613101d29e008c4154f716548ec95c20c681be3b0321026f9e8cf9c0b994ce152f4ef3eef43866197ed38cb6f5334a0834825bf08d38edffffffff01e0930400000000001976a9140a5b77df9884772aa39d6aac56a8e18106c7213688ac00000000000000000000000000000000000000';
    const existingOutput = await testFunction(rawPsbtHex);
    console.log('existingOutput', existingOutput);
  };
  return (
    <div>
      <button
        onClick={handleTest}
        className='rounded-2xl border px-5 py-2 text-sm font-semibold transition'
      >
        Test
      </button>
    </div>
  );
}

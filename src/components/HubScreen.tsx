import CardButton from './CardButton';
import IconBubble from './IconBubble';

type HubScreenProps = {
  onCreateWallet: () => void;
  onImportWallet: () => void;
};

const HubScreen = ({ onCreateWallet, onImportWallet }: HubScreenProps) => (
  <div className='mx-auto flex w-full max-w-5xl flex-col items-center gap-10 text-center'>
    <IconBubble
      symbol='👛'
      size='h-28 w-28'
      accent='from-indigo-600 to-blue-500'
    />
    <div>
      <h1 className='text-4xl font-semibold text-white'>ZCASH WALLET</h1>
      <p className='mt-3 text-base text-slate-300'>
        Secure, decentralized Zcash wallet for managing ZEC and inscriptions.
      </p>
    </div>
    <div className='grid w-full gap-6 md:grid-cols-2'>
      <CardButton
        title='Create Wallet'
        description='Generate a new wallet with a secure 12-word recovery phrase.'
        symbol='✨'
        accent='from-indigo-600/80 to-blue-500/80'
        onClick={onCreateWallet}
      />
      <CardButton
        title='Import Wallet'
        description='Restore an existing wallet using your recovery phrase.'
        symbol='📥'
        accent='from-emerald-500/80 to-teal-400/80'
        onClick={onImportWallet}
      />
    </div>
  </div>
);

export default HubScreen;

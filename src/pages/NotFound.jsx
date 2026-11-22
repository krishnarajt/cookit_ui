import { Link } from 'react-router-dom';
import { CookingPot } from 'lucide-react';
import Button from '../components/ui/Button';
import { Page } from '../components/ui/Motion';

export default function NotFound() {
  return (
    <Page className="grid min-h-[60vh] place-items-center py-10">
      <div className="text-center">
        <CookingPot size={40} className="mx-auto text-ink-3" aria-hidden />
        <h1 className="mt-5 text-3xl">Nothing on this shelf.</h1>
        <p className="mt-2 text-sm text-ink-2">
          That page doesn&apos;t exist. The wheel, however, still does.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button>Back to the wheel</Button>
        </Link>
      </div>
    </Page>
  );
}

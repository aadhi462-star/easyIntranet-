// Terms of Service: not supplied yet by the organisation running this site; say so honestly.
import { Link } from 'react-router-dom';
import { PublicPage, Section } from '../components/public/PublicChrome.jsx';

const a = 'font-semibold text-brand-300 underline-offset-4 hover:underline';

export default function Terms() {
  return (
    <PublicPage title="Terms of Service" lede="The terms for using this CommunityOne site will be published here by the organisation that runs it. They haven’t been published yet.">
      <Section title="Until then">
        <p>Each community sets its own guidelines, which you’ll find on the community’s page, and its owner and admins moderate it. For how the site handles your data today, read the <Link className={a} to="/privacy">Privacy Policy</Link>. For help, see <Link className={a} to="/help">Help and Support</Link>.</p>
      </Section>
    </PublicPage>
  );
}

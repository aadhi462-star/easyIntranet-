// Contact: the operator hasn't supplied contact details yet; point to what works today.
import { Link } from 'react-router-dom';
import { PublicPage, Section } from '../components/public/PublicChrome.jsx';

const a = 'font-semibold text-brand-300 underline-offset-4 hover:underline';

export default function Contact() {
  return (
    <PublicPage title="Contact" lede="Contact details for the organisation running this CommunityOne site will be published here. They haven’t been published yet.">
      <Section title="What you can do now">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Answers to common questions are in <Link className={a} to="/help">Help and Support</Link>.</li>
          <li>For anything about a community, contact its owner or admins, listed on the community’s Members page.</li>
          <li>Locked out? Use “Forgot your password?” on the <Link className={a} to="/login">sign-in page</Link>.</li>
        </ul>
      </Section>
    </PublicPage>
  );
}

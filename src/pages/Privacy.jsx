// Privacy: a factual summary of what this CommunityOne actually stores and does today. It is not a
// legal policy; the organisation running the site publishes that (see Terms).
import { Link } from 'react-router-dom';
import { PublicPage, Section } from '../components/public/PublicChrome.jsx';

const a = 'font-semibold text-brand-300 underline-offset-4 hover:underline';

export default function Privacy() {
  return (
    <PublicPage title="Privacy Policy" lede="A plain summary of what CommunityOne stores about you and why. The organisation running this site may publish a fuller policy.">
      <Section title="Your account">
        <p>Your name, email address and account status. Your password is never stored: only a one-way scrypt hash of it, which can’t be turned back into the password.</p>
      </Section>
      <Section title="Your profile">
        <p>Only what you choose to add: headline, bio, city, company and role, education and career history, skills, birthday (day and month only), LinkedIn link and mentoring preference. You decide who sees your contact details and whether you appear in the member directory.</p>
      </Section>
      <Section title="Communities and activity">
        <p>The communities you belong to and your role in each; your posts, comments, reactions, poll votes, acknowledgements, events and RSVPs; your connections and the people you’ve blocked. What others can see follows each community’s visibility and your settings.</p>
      </Section>
      <Section title="Cookies and your browser">
        <p>Two cookies, both needed for the site to work: a sign-in session cookie (your browser can’t read it, and only a hashed copy is kept on the server, together with the IP address and browser of each session) and a security token that protects forms against forged requests. Your light or dark theme choice is kept in your browser. Some older features still keep their data in your browser for now.</p>
        <p>There are no advertising or analytics trackers. The site’s typeface is loaded from Google Fonts, so your browser contacts Google’s font servers.</p>
      </Section>
      <Section title="Emails">
        <p>We email you to confirm your address, reset or confirm a password change, confirm a new email address, and when an event you RSVP’d to is cancelled or changes. A copy of each email is kept as a delivery record.</p>
      </Section>
      <Section title="Security records">
        <p>Sensitive actions (such as role changes, suspensions, removals, deletions and administrator access to a community) are recorded with who did them, when and from which IP address, so they can be reviewed.</p>
      </Section>
      <Section title="Your choices">
        <p>You can edit your profile at any time, deactivate your account, or delete it; deleting removes your personal details and shows your past posts as from a “Deleted member”. A copy of your personal data can be exported after re-entering your password; a button for it is being added to account settings. Questions: see <Link className={a} to="/contact">Contact</Link>.</p>
      </Section>
    </PublicPage>
  );
}

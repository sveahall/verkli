import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUpRight, AudioLines, BookOpen, FileText, Languages, Plus } from "lucide-react";
import styles from "./AuthorLandingSections.module.css";

const chapters = [
  { id: "writing", label: "Write", icon: FileText },
  { id: "translation", label: "Translate", icon: Languages },
  { id: "audio", label: "Create audio", icon: AudioLines },
  { id: "publishing", label: "Publish", icon: BookOpen },
];

const questions = [
  {
    title: "Who is Verkli for?",
    answer: "Verkli is for authors who want to bring a manuscript to life, and readers who want to discover their work. The author studio brings writing, translation, audiobook creation and publishing into one place.",
  },
  {
    title: "Can I bring a manuscript I have already written?",
    answer: "Yes. Import an existing manuscript and work on its chapters in the editor. You can also start with a blank page and build your story in Verkli.",
  },
  {
    title: "Does AI write the book for me?",
    answer: "You lead the creative work. Use AI tools to help refine text, translate chapters or create narration, then review the results before publishing.",
  },
  {
    title: "How do I get access?",
    answer: "Verkli is in private pre-launch. Join the author waitlist and we will contact you as invitations become available. Already invited? Sign in to open your workspace.",
  },
];

export default function AuthorLandingSections() {
  return (
    <div className={styles.sections}>
      <nav className={styles.chapterNav} aria-label="Explore Verkli">
        <p>One story. Every dimension.</p>
        <div>
          {chapters.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`}><Icon size={18} aria-hidden="true" />{label}<ArrowDown size={14} aria-hidden="true" /></a>
          ))}
        </div>
      </nav>

      <section className={styles.productStory} aria-labelledby="studio-story-title">
        <div className={styles.intro}>
          <div>
            <p className={styles.eyebrow}>A little help. A lot of possibility.</p>
            <h2 id="studio-story-title">Big ideas deserve<br /><span className={styles.gradient}>more than a document.</span></h2>
          </div>
          <p className={styles.introCopy}>From the first sentence to a whole new audience. Bring your writing, your languages and your voice together in Verkli.</p>
        </div>

        <article id="writing" className={styles.writing} aria-labelledby="writing-title">
          <div className={styles.writingCopy}>
            <p className={styles.eyebrow}><span>01</span> / Your writing space</p>
            <h3 id="writing-title">Your next chapter.<br /><span>All the space<br />it needs.</span></h3>
            <p>Bring your manuscript. Find your flow. Shape each chapter in a focused editor, with AI support when you want a fresh perspective.</p>
            <div className={styles.writingDetails}>
              <span><FileText size={16} aria-hidden="true" />Manuscript import</span>
              <span><BookOpen size={16} aria-hidden="true" />Chapter editor</span>
            </div>
            <Link href="/how-it-works" className={styles.textLink}>Explore the workflow <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
          <figure className={styles.writingArt}>
            <Image src="/images/waitlist-studio-write-v1.png" alt="Verkli writing studio with a manuscript and creative partner panel." width={1254} height={1254} sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1439px) 56vw, 740px" quality={85} />
            <figcaption>Verkli Studio · Illustrative product concept</figcaption>
          </figure>
        </article>

        <div className={styles.dimensions}>
          <article id="translation" className={styles.dimension} aria-labelledby="translation-title">
            <div className={styles.dimensionCopy}>
              <p className={styles.eyebrow}><span>02</span> / Translation</p>
              <h3 id="translation-title">A new language.<br /><span>Still your story.</span></h3>
              <p>Give your words a new way to travel. Translate your chapters, review the result, and prepare another edition for new readers.</p>
            </div>
            <figure>
              <Image src="/images/waitlist-studio-translate-v1.png" alt="Illustrative translation workspace comparing a passage in English, Swedish and Spanish." width={1254} height={1254} sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1439px) 46vw, 646px" quality={85} />
              <figcaption><Languages size={16} aria-hidden="true" />Translation concept · Example languages</figcaption>
            </figure>
          </article>
          <article id="audio" className={`${styles.dimension} ${styles.audio}`} aria-labelledby="audio-title">
            <div className={styles.dimensionCopy}>
              <p className={styles.eyebrow}><span>03</span> / Audiobooks</p>
              <h3 id="audio-title">Let them hear<br /><span>your imagination.</span></h3>
              <p>Turn the words on your page into narrated audio. Choose a voice, listen back, and shape an audiobook chapter by chapter.</p>
            </div>
            <figure>
              <Image src="/images/waitlist-studio-audio-v1.png" alt="Illustrative audiobook studio with a narration waveform and chapter preview." width={1254} height={1254} sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1439px) 46vw, 646px" quality={85} />
              <figcaption><AudioLines size={16} aria-hidden="true" />Audio concept · This illustration has no sound</figcaption>
            </figure>
          </article>
        </div>
      </section>

      <section id="publishing" className={styles.publishing} aria-labelledby="publishing-title">
        <div className={styles.publishHeading}>
          <p className={styles.eyebrow}>04 / Out into the world</p>
          <h2 id="publishing-title">From your desk.<br /><span className={styles.gradient}>To their next favourite.</span></h2>
          <p>A clear path from the work you have made to the readers who will make it their own.</p>
        </div>
        <ol className={styles.steps}>
          {[
            { title: "Make it yours.", copy: "Import your manuscript or start fresh. Write, edit and arrange your chapters in one workspace." },
            { title: "Open up the possibilities.", copy: "Create a translated edition or add narration. Review each version before sharing it." },
            { title: "Meet your readers.", copy: "Prepare your book page and publish on Verkli, where readers can discover, read and listen." },
          ].map((step, index) => (
            <li key={step.title}>
              <div className={styles.stepNumber}><span>0{index + 1}</span><ArrowRight size={20} aria-hidden="true" /></div>
              <h3>{step.title}</h3><p>{step.copy}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.faq} aria-labelledby="author-questions-title">
        <div>
          <p className={styles.eyebrow}>A few things to know</p>
          <h2 id="author-questions-title">Big possibility.<br />Straight answers.</h2>
          <Link href="/faq" className={styles.textLink}>More about Verkli <ArrowUpRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className={styles.questions}>
          {questions.map(({ title, answer }) => (
            <details key={title}>
              <summary>{title}<Plus size={20} aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.invitation} aria-labelledby="author-invitation-title">
        <div className={styles.invitationBrand} aria-hidden="true"><Image src="/favi.svg" alt="" width={240} height={220} /></div>
        <div className={styles.invitationCopy}>
          <p className={styles.eyebrow}><span className={styles.statusDot} />Private pre-launch</p>
          <h2 id="author-invitation-title">The next chapter<br /><span className={styles.gradient}>could be yours.</span></h2>
          <p>We are opening Verkli to authors in small waves.<br />Bring your story. Be part of what comes next.</p>
          <div className={styles.invitationActions}>
            <Link href="/waitlist" className={styles.invitationButton}>Join the waitlist <ArrowUpRight size={19} aria-hidden="true" /></Link>
            <Link href="/author/signin" className={styles.textLink}>Already invited? Sign in <ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className={styles.invitationFoot}><span>Your ideas. Your voice. A whole new dimension.</span><span>verkli</span></div>
      </section>
    </div>
  );
}

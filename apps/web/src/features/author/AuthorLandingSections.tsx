import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, FileText, Languages, Plus } from "lucide-react";
import styles from "./AuthorLandingSections.module.css";

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

const possibilities = [
  { icon: FileText, title: "Find your flow.", detail: "Bring your manuscript or begin with a blank page. Shape each chapter in a focused editor, with AI support when you want another perspective.", label: "WRITE", id: "writing" },
  { icon: Languages, title: "Open another world.", detail: "Create a translated edition, review it chapter by chapter, and give your story a way to reach readers in another language.", label: "TRANSLATE", id: "translation" },
  { icon: AudioLines, title: "Make every word heard.", detail: "Turn written chapters into narrated audio. Choose a voice, listen back, and refine the result before sharing your audiobook.", label: "CREATE AUDIO", id: "audio" },
  { icon: BookOpen, title: "Meet your readers.", detail: "Prepare your book page and publish on Verkli, where readers can discover, read and listen to the work you have made.", label: "PUBLISH", id: "publishing" },
];

export default function AuthorLandingSections() {
  return <div className={styles.sections}>
    <section className={styles.possibilities} aria-labelledby="possibilities-title">
      <div className={styles.possibilityIntro}><p className={styles.eyebrow}>BUILT AROUND YOUR IMAGINATION</p><h2 id="possibilities-title">The story is yours.<br /><span>So is the next move.</span></h2><p>Less moving between tools.<br />More moving the story forward.</p><a href="#studio" className={styles.textLink}>Experience the workspace <ArrowUpRight size={17} /></a></div>
      <div className={styles.possibilityList}>{possibilities.map(({ icon: Icon, title, detail, label, id }, index) => <details key={id} open={index === 0}><summary><span className={styles.possibilityNumber}>0{index + 1}</span><div><span className={styles.possibilityLabel}><Icon size={13} />{label}</span><h3>{title}</h3></div><Plus size={20} /></summary><p>{detail}</p></details>)}</div>
    </section>
    <section className={styles.invitation} aria-labelledby="author-invitation-title">
      <div className={styles.invitationTop}><p className={styles.eyebrow}><span className={styles.statusDot} />PRIVATE PRE-LAUNCH</p><span>For the stories only you can tell.</span></div>
      <div className={styles.invitationBody}><div><h2 id="author-invitation-title">A new chapter.<br /><span>And you’re invited.</span></h2><p>We’re opening Verkli to authors in small waves.<br />Bring your imagination. Be part of what comes next.</p><Link href="/waitlist" className={styles.invitationButton}>Get early access <ArrowUpRight size={18} /></Link></div><div className={styles.brandSculpture} aria-hidden="true"><div /><Image src="/favi.svg" alt="" width={230} height={230} /></div></div>
      <div className={styles.invitationFoot}><span>YOUR IDEAS. YOUR VOICE. YOUR VERKLI.</span><Link href="/author/signin">Already invited? Sign in <ArrowRight size={15} /></Link></div>
    </section>
    <section className={styles.faq} aria-labelledby="author-questions-title"><div><p className={styles.eyebrow}>GOOD QUESTIONS</p><h2 id="author-questions-title">A little more<br />about Verkli.</h2><Link href="/faq" className={styles.textLink}>All questions <ArrowUpRight size={17} /></Link></div><div className={styles.questions}>{questions.map(({ title, answer }) => <details key={title}><summary>{title}<Plus size={18} /></summary><p>{answer}</p></details>)}</div></section>
  </div>;
}

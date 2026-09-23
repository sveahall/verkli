import { notFound } from "next/navigation";
import Fixture from "./Fixture";
export default function Page() { if (process.env.NODE_ENV !== "development") notFound(); return <Fixture />; }

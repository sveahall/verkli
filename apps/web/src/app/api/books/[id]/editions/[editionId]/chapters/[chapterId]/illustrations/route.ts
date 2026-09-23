import { listCandidates, saveCandidate } from "@/lib/illustration-candidates/routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = listCandidates;
export const POST = saveCandidate;

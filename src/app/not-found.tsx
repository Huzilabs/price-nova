import { Card } from "@/components/primitives/Card";
import { Button } from "@/components/primitives/Button";
import { Wordmark } from "@/components/shell/Wordmark";

/**
 * 404. Reached by `notFound()` in the draw detail route, among others — a draw
 * id that does not exist, or a draft a participant is not allowed to see.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5"><Wordmark /></header>
      <main className="flex grow items-center justify-center px-5 py-12">
        <Card className="w-full max-w-md p-6">
          <div className="tag text-faint">404</div>
          <h1 className="font-display mt-2 text-h2 font-extrabold tracking-[-0.025em] text-hi">
            Not found
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-mid">
            This page does not exist, or the draw you are looking for has not been
            published yet.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button href="/draws" variant="primary" size="lg" fullWidth>Browse draws</Button>
            <Button href="/" variant="outline" size="lg" fullWidth>Home</Button>
          </div>
        </Card>
      </main>
    </div>
  );
}

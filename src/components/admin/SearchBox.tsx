import { Input } from "@/components/primitives/Field";

/** Plain GET form — searches survive a refresh and are linkable. */
export function SearchBox({ basePath, status, defaultValue, placeholder = "Search name or email" }: {
  basePath: string; status: string; defaultValue: string; placeholder?: string;
}) {
  return (
    <form action={basePath} className="flex items-center gap-2">
      <input type="hidden" name="status" value={status} />
      <Input
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-(--control-h) w-56"
        aria-label="Search"
      />
    </form>
  );
}

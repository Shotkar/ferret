/**
 * Language, per device (lib/i18n.ts) — in the account menu and on the phone's More page, beside Appearance. Shown only
 * when this build has a language besides English. Partly translated ones say how far along they are.
 */
import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";
import { LANGUAGES, MOSTLY_TRANSLATED, currentLanguage, setLanguage } from "./lib/i18n";

export function LanguageChoice({ inMenu = false }: { inMenu?: boolean }) {
  const { t } = useLingui();
  const id = useId();
  if (LANGUAGES.length < 2) return null;
  const select = (
    <select id={id} className={`select ${inMenu ? "select-sm" : ""} w-full`} value={currentLanguage()} onChange={(e) => setLanguage(e.target.value)}>
      {LANGUAGES.map(({ code, name, percent }) => (
        <option key={code} value={code}>
          {percent >= MOSTLY_TRANSLATED ? name : t`${name} (${percent}% translated)`}
        </option>
      ))}
    </select>
  );
  if (inMenu) {
    return (
      <li className="px-3 pb-1" role="none">
        <label className="dropdown-title block px-1 pt-1 text-xs" htmlFor={id}>
          <Trans>Language</Trans>
        </label>
        {select}
      </li>
    );
  }
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold" htmlFor={id}>
        <Trans>Language</Trans>
      </label>
      {select}
    </div>
  );
}

/**
 * The war dance (lib/dook.ts): the mascot hops in from the right, dances on the spot and hops off to the left, over
 * everything (the scanner too) but never in the way of a tap. With reduced motion he just appears and fades.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import side from "./assets/mascot/side.webp";
import { dookDook, listenForKonami, onDance } from "./lib/dook";

export function WarDance() {
  const [on, setOn] = useState(false);
  const dancing = useRef(false);

  useEffect(() => listenForKonami(), []);
  useEffect(
    () =>
      onDance(() => {
        if (dancing.current) return;
        dancing.current = true;
        dookDook();
        setOn(true);
      }),
    [],
  );

  const done = () => {
    dancing.current = false;
    setOn(false);
  };

  if (!on) return null;
  return createPortal(
    <div className="war-dance" aria-hidden onAnimationEnd={(e) => e.target === e.currentTarget && done()}>
      <div className="war-dance-turn">
        <img src={side} alt="" width={325} height={400} className="war-dance-hop drop-shadow-[0_6px_6px_rgb(0_0_0/0.25)]" />
      </div>
    </div>,
    document.body,
  );
}

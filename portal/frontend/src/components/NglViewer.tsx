"use client";

import { useEffect, useRef } from "react";

type Props = {
  url: string | null;
};

export function NglViewer({ url }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let stage: any;
    async function init() {
      if (!url || !ref.current) return;
      const NGL = await import("ngl");
      stage = new NGL.Stage(ref.current, { backgroundColor: "#050816" });
      const comp = await stage.loadFile(url, { ext: "pdb" });
      comp.addRepresentation("cartoon", { colorScheme: "chainname" });
      comp.autoView();
    }
    init();
    return () => {
      if (stage) {
        stage.dispose();
      }
    };
  }, [url]);

  return <div ref={ref} className="h-80 w-full rounded-xl border border-slate-800" />;
}


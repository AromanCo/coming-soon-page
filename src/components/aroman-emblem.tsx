import type { SVGProps } from "react";

/** Scalable vector redraw of the supplied AROMAN triple-hexagon monogram. */
export function AromanEmblem(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="190 185 620 655" fill="none" stroke="currentColor" role="presentation" aria-hidden="true" {...props}>
      <path
        d="M501 205 784 358v314L500 829 217 673V358L501 205Z"
        strokeWidth="9"
        strokeLinejoin="miter"
      />
      <path
        d="M501 266 733 397v251L500 779 268 648V396L501 266Z"
        strokeWidth="9"
        strokeLinejoin="miter"
      />
      <path
        d="M501 302 699 414v217L500 745 301 632V414L501 302Z"
        strokeWidth="9"
        strokeLinejoin="miter"
      />
      <path
        d="m428 495 72-119 73 119"
        strokeWidth="15"
        strokeLinejoin="round"
        strokeLinecap="square"
      />
      <path d="M383 554h234M383 625h234" strokeWidth="15" strokeLinecap="round" />
    </svg>
  );
}

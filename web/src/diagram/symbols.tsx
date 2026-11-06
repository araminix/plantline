import type { ReactNode } from "react";
import type { NodeKind } from "../plants";

/**
 * Single-line symbols in the style of IEC 60617, drawn in a 48 x 48 box centred on the element, with the connection
 * points at the top (0, -24) and bottom (0, 24). Strokes use currentColor, so the theme or export sets the colour.
 */
const lead = (from: number, to: number) => <line x1={0} y1={from} x2={0} y2={to} />;
const earth = (y: number) => (
    <>
        <line x1={-10} y1={y} x2={10} y2={y} />
        <line x1={-6} y1={y + 4} x2={6} y2={y + 4} />
        <line x1={-2} y1={y + 8} x2={2} y2={y + 8} />
    </>
);

const SYMBOLS: Record<Exclude<NodeKind, "busbar">, ReactNode> = {
    gridConnection: (
        <>
            <rect x={-14} y={-22} width={28} height={18} />
            <path d="M-14 -22 L14 -4 M14 -22 L-14 -4" />
            {lead(-4, 24)}
        </>
    ),
    breaker: (
        <>
            {lead(-24, -9)}
            <rect x={-9} y={-9} width={18} height={18} />
            <path d="M-5 -5 L5 5 M5 -5 L-5 5" />
            {lead(9, 24)}
        </>
    ),
    disconnector: (
        <>
            {lead(-24, -10)}
            <line x1={-6} y1={-10} x2={6} y2={-10} />
            <line x1={0} y1={10} x2={-10} y2={-8} />
            {lead(10, 24)}
        </>
    ),
    earthSwitch: (
        <>
            {lead(-24, -6)}
            <line x1={0} y1={6} x2={-9} y2={-6} />
            {earth(6)}
        </>
    ),
    fuse: (
        <>
            {lead(-24, 24)}
            <rect x={-6} y={-13} width={12} height={26} />
        </>
    ),
    transformer: (
        <>
            {lead(-24, -19)}
            <circle cx={0} cy={-8} r={11} />
            <circle cx={0} cy={8} r={11} />
            {lead(19, 24)}
        </>
    ),
    transformer3w: (
        <>
            {lead(-24, -18)}
            <circle cx={0} cy={-9} r={9} />
            <circle cx={-7} cy={5} r={9} />
            <circle cx={7} cy={5} r={9} />
            {lead(14, 24)}
        </>
    ),
    currentTransformer: (
        <>
            {lead(-24, 24)}
            <circle cx={0} cy={0} r={8} />
        </>
    ),
    voltageTransformer: (
        <>
            {lead(-24, -14)}
            <circle cx={0} cy={-7} r={7} />
            <circle cx={0} cy={5} r={7} />
            {earth(14)}
        </>
    ),
    surgeArrester: (
        <>
            {lead(-24, -10)}
            <rect x={-6} y={-10} width={12} height={18} />
            <path d="M0 -6 V4 M-3 1 L0 4 L3 1" />
            {lead(8, 12)}
            {earth(12)}
        </>
    ),
    meter: (
        <>
            {lead(-24, -12)}
            <circle cx={0} cy={0} r={12} />
            <text x={0} y={4} textAnchor="middle" fontSize={10} stroke="none" fill="currentColor">
                Wh
            </text>
            {lead(12, 24)}
        </>
    ),
    load: (
        <>
            {lead(-24, 4)}
            <path d="M-8 4 H8 L0 18 Z" />
        </>
    ),
    capacitorBank: (
        <>
            {lead(-24, -4)}
            <line x1={-11} y1={-4} x2={11} y2={-4} />
            <line x1={-11} y1={4} x2={11} y2={4} />
            {lead(4, 24)}
        </>
    ),
    reactor: (
        <>
            {lead(-24, -10)}
            <path d="M0 -10 A10 10 0 1 0 10 0 H0 V24" />
        </>
    ),
    overheadLine: (
        <>
            {lead(-24, 24)}
            <path d="M-10 14 L0 -14 L10 14 M-7 4 H7" />
        </>
    ),
    cableLine: (
        <>
            {lead(-24, 24)}
            <path d="M-8 -8 L0 2 L8 -8" />
        </>
    ),
    pvArray: (
        <>
            {lead(-24, -12)}
            <rect x={-16} y={-12} width={32} height={22} />
            <path d="M-16 10 L16 -12 M6 -8 L12 -2 M12 -8 V-2 H6" />
            {lead(10, 24)}
        </>
    ),
    combinerBox: (
        <>
            <path d="M-8 -24 V-12 M0 -24 V-12 M8 -24 V-12" />
            <rect x={-13} y={-12} width={26} height={22} />
            <path d="M-6 -4 H6 M-6 2 H6" />
            {lead(10, 24)}
        </>
    ),
    inverter: (
        <>
            {lead(-24, -14)}
            <rect x={-14} y={-14} width={28} height={28} />
            <path d="M-14 14 L14 -14 M-10 -8 H-3 M-10 -5 H-3 M3 7 C5 3 7 3 9 7 C10 9 11 9 12 7" />
            {lead(14, 24)}
        </>
    ),
    windTurbine: (
        <>
            <circle cx={0} cy={-10} r={3} />
            <path d="M0 -13 V-24 M2.6 -8.5 L12 -3 M-2.6 -8.5 L-12 -3" />
            {lead(-7, 24)}
        </>
    ),
    battery: (
        <>
            {lead(-24, -5)}
            <line x1={-12} y1={-5} x2={12} y2={-5} />
            <line x1={-6} y1={1} x2={6} y2={1} strokeWidth={4} />
            {lead(1, 24)}
        </>
    ),
    generator: (
        <>
            {lead(-24, -13)}
            <circle cx={0} cy={0} r={13} />
            <text x={0} y={5} textAnchor="middle" fontSize={14} stroke="none" fill="currentColor">
                G
            </text>
            {lead(13, 24)}
        </>
    ),
};

/** The symbol of an element; busbars are drawn by their node, which knows their length. */
export function NodeSymbol({ kind }: { kind: NodeKind }) {
    return (
        <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {kind === "busbar" ? <line x1={-20} y1={0} x2={20} y2={0} strokeWidth={6} /> : SYMBOLS[kind]}
        </g>
    );
}

/** A symbol on its own, for the palette and the plant type picker. */
export function SymbolIcon({ kind, size = 32 }: { kind: NodeKind; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="-26 -26 52 52" aria-hidden="true" focusable="false">
            <NodeSymbol kind={kind} />
        </svg>
    );
}

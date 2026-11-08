import { useMemo, useState } from "react";
import { CircleAlert, Check } from "lucide-react";

import { fmtUsdc, simulate, type AttestationState, type SessionPhase } from "../lib/settle";
import { Card, Pill, Section } from "./ui";

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-300">{props.label}</span>
        <span className="font-mono text-ink-100">{props.display}</span>
      </div>
      <input
        type="range"
        className="mt-2 w-full"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Segmented<T extends string>(props: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="text-sm text-ink-300">{props.label}</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {props.options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => props.onChange(v)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              props.value === v
                ? "border-mint-400/50 bg-mint-400/15 text-mint-300"
                : "border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-600"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const bindingLabel = {
  metered: "metered by the enclave",
  voucher: "authorized by the payer's voucher",
  deposit: "escrowed deposit",
};

export function Simulator() {
  const [deposit, setDeposit] = useState(5_000_000);
  const [price, setPrice] = useState(1_000);
  const [units, setUnits] = useState(1_200);
  const [voucher, setVoucher] = useState(2_000_000);
  const [feeBps, setFeeBps] = useState(250);
  const [attestation, setAttestation] = useState<AttestationState>("valid");
  const [phase, setPhase] = useState<SessionPhase>("open");

  const out = useMemo(
    () => simulate({ deposit, pricePerUnit: price, unitsMetered: units, voucherAuthorized: voucher, alreadySettled: 0, feeBps, attestation, phase }),
    [deposit, price, units, voucher, feeBps, attestation, phase],
  );

  const bar = (v: number) => `${Math.min(100, (v / deposit) * 100)}%`;

  return (
    <Section
      id="simulator"
      eyebrow="Try it"
      title="The settlement rule, live."
      lead="This mirrors the program's settle instruction exactly. Move the sliders, then revoke the attestation and watch the payment stop."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="space-y-6">
          <Slider label="Deposit (escrow ceiling)" value={deposit} min={500_000} max={20_000_000} step={500_000} onChange={setDeposit} display={`${fmtUsdc(deposit)} USDC`} />
          <Slider label="Price per token" value={price} min={1} max={5_000} step={1} onChange={setPrice} display={`${fmtUsdc(price)} USDC`} />
          <Slider label="Tokens metered by the enclave (receipt)" value={units} min={0} max={20_000} step={50} onChange={setUnits} display={units.toLocaleString()} />
          <Slider label="Payer's cumulative voucher" value={voucher} min={0} max={20_000_000} step={100_000} onChange={setVoucher} display={`${fmtUsdc(voucher)} USDC`} />
          <Slider label="Protocol fee" value={feeBps} min={0} max={1_000} step={25} onChange={setFeeBps} display={`${(feeBps / 100).toFixed(2)}%`} />
          <Segmented
            label="Hardware attestation"
            value={attestation}
            onChange={setAttestation}
            options={[
              ["valid", "valid"],
              ["revoked", "revoked by verifier"],
              ["expired", "expired"],
              ["measurement-revoked", "measurement revoked"],
            ]}
          />
          <Segmented
            label="Session"
            value={phase}
            onChange={setPhase}
            options={[
              ["open", "open"],
              ["closing-in-grace", "close requested (in grace)"],
              ["grace-elapsed", "grace elapsed"],
            ]}
          />
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs tracking-widest text-ink-400 uppercase">settle()</p>
            {out.allowed ? (
              <Pill>
                <Check className="size-3" /> pays
              </Pill>
            ) : (
              <Pill tone="rose">
                <CircleAlert className="size-3" /> rejected
              </Pill>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-ink-800 bg-ink-950/60 p-4 font-mono text-sm">
            <p className="text-ink-400">target = min(voucher, units × price, deposit)</p>
            <p className="mt-1">
              = min({fmtUsdc(voucher)}, {fmtUsdc(units * price)}, {fmtUsdc(deposit)})
            </p>
            <p className="mt-1 text-mint-300">
              = {fmtUsdc(out.target)} USDC <span className="text-ink-400">· bound by {bindingLabel[out.binding]}</span>
            </p>
          </div>

          <div className="mt-6 space-y-3">
            {(
              [
                ["Provider payout", out.provider, "bg-mint-400"],
                ["Protocol fee", out.fee, "bg-iris-400"],
                ["Refund to payer on close", out.refund, "bg-ink-400"],
              ] as const
            ).map(([label, v, color]) => (
              <div key={label}>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-300">{label}</span>
                  <span className="font-mono">{fmtUsdc(v)} USDC</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
                  <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: bar(v) }} />
                </div>
              </div>
            ))}
          </div>

          <p className={`mt-6 rounded-xl p-4 text-sm ${out.allowed ? "bg-mint-400/10 text-mint-300" : "bg-rose-400/10 text-rose-400"}`}>{out.reason}</p>
          {out.payerCanExitNow && (
            <p className="mt-3 text-sm text-ink-300">
              The payer can call <span className="font-mono text-ink-100">close_session</span> right now, with no grace period, and recover the full escrow.
            </p>
          )}
        </Card>
      </div>
    </Section>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

type RegisterForm = {
	title: string;
	category: string;
	nodeType: string;
	description: string;
	endpointUrl: string;
	price: string;
	ratings: string;
	latencyMs: string;
	more_context: string;
	icon: string;
	providerAddress: string;
	apiVersion: string;
	healthCheckUrl: string;
};

type RegisterResponse =
	| { success: true; nodeId: string; message: string; node?: { name?: string } }
	| { error: string; details?: string };

const DEFAULTS: RegisterForm = {
  title: "",
  nodeType: "",
  description: "",
  endpointUrl: "",
  price: "",
  more_context: "",
  providerAddress: "",
};

export default function NodeRegisterPage() {
	const [form, setForm] = useState<RegisterForm>(DEFAULTS);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<RegisterResponse | null>(null);

	const isValid = useMemo(() => {
		return (
			form.title.trim() &&
			form.endpointUrl.trim()
		);
	}, [form]);

	const onChange = (key: keyof RegisterForm) =>
		(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((prev) => ({ ...prev, [key]: e.target.value }));
		};

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!isValid || loading) return;

		setLoading(true);
		setResult(null);
		try {
			const res = await fetch("/api/nodes/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: form.title.trim(),
					nodeType: form.nodeType.trim() || undefined,
					description: form.description.trim() || undefined,
					endpointUrl: form.endpointUrl.trim(),
					price: form.price ? Number(form.price) : undefined,
					more_context: form.more_context.trim() || undefined,
					providerAddress: form.providerAddress.trim() || undefined,
				}),
			});

			let data: RegisterResponse;
			try {
				data = await res.json();
			} catch (e) {
				throw new Error("Server returned invalid response");
			}
			setResult(data);
		} catch (err: any) {
			setResult({ error: "Registration failed", details: err?.message });
		} finally {
			setLoading(false);
		}
	};

	const onReset = () => setForm(DEFAULTS);

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100">
			<div className="mx-auto max-w-5xl px-6 py-12">
				<div className="mb-10">
					<h1 className="text-3xl font-semibold tracking-tight">Node Registration</h1>
					<p className="mt-2 text-slate-300">
						Self-announce your provider node to the marketplace. This enables discovery and x402 payment routing.
					</p>
				</div>

				<form
					onSubmit={onSubmit}
					className="grid gap-6 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-xl"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						  <Field label="Node Title" value={form.title} onChange={onChange("title")} required placeholder="e.g. Alternative Intelligence & Sentiment" />
						  <Field label="Node Type" value={form.nodeType} onChange={onChange("nodeType")} placeholder="e.g. sentiment" />
						  <Field label="Endpoint URL" value={form.endpointUrl} onChange={onChange("endpointUrl")} required placeholder="e.g. http://localhost:4002/api/sentiment" />
						  <Field label="Price (USDC)" value={form.price} onChange={onChange("price")} placeholder="e.g. 0.45" />
						<Field label="Provider Wallet" value={form.providerAddress} onChange={onChange("providerAddress")} placeholder="e.g. 29btcGViz61Db5c1HTeEyw9p5rpDQG87VYNe1WupQnDL" />
					</div>

					<TextArea
						label="Description"
						value={form.description}
						onChange={onChange("description")}
						placeholder="Describe your node's data and coverage. e.g. Quantifies the 'human element' of the market by aggregating social data to generate sentiment signals."
					/>
					<TextArea
						label="More Context"
						value={form.more_context}
						onChange={onChange("more_context")}
						placeholder="Permanent context for this node (optional)"
					/>

					<div className="flex flex-wrap items-center gap-3">
						<button
							type="submit"
							disabled={!isValid || loading}
							className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{loading ? "Registering..." : "Register Node"}
						</button>
						<button
							type="button"
							onClick={onReset}
							className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
						>
							Reset to Defaults
						</button>
						<span className="text-xs text-slate-400">
							Required fields: title, endpoint URL
						</span>
					</div>
				</form>

				{result && (
						<div className="mt-6 rounded-xl border border-border bg-card/50 p-5">
						{"success" in result ? (
							<div className="text-emerald-300">
								✅ {result.message}. Node ID: <span className="font-mono">{result.nodeId}</span>
							</div>
						) : (
							<div className="text-rose-300">
								❌ {result.error}{result.details ? `: ${result.details}` : ""}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function Field({
	label,
	value,
	onChange,
	placeholder,
	required,
}: {
	label: string;
	value: string;
	onChange: (e: ChangeEvent<HTMLInputElement>) => void;
	placeholder?: string;
	required?: boolean;
}) {
	return (
		<label className="grid gap-2 text-sm">
			<span className="text-slate-300">
				{label} {required ? <span className="text-rose-400">*</span> : null}
			</span>
			<input
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				className="rounded-lg border border-border bg-card/50 px-3 py-2 text-foreground outline-none ring-primary/40 focus:ring"
			/>
		</label>
	);
}

function TextArea({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
	placeholder?: string;
}) {
	return (
		<label className="grid gap-2 text-sm">
			<span className="text-slate-300">{label}</span>
			<textarea
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				rows={4}
				className="rounded-lg border border-border bg-card/50 px-3 py-2 text-foreground outline-none ring-primary/40 focus:ring"
			/>
		</label>
	);
}

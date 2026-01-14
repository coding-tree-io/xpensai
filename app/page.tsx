"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
} from "react";
import { format, parseISO } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from "recharts";
import { useAction, useMutation, useQuery } from "convex/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultCategories } from "@/lib/categories";
import { authClient } from "@/lib/auth-client";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();

  useEffect(() => {
    if (!isSessionPending && !session?.user) {
      router.replace("/sign-in");
    }
  }, [isSessionPending, router, session]);

  if (isSessionPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-lg font-semibold tracking-wide">Loading…</div>
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-lg font-semibold tracking-wide">
          Redirecting to sign in…
        </div>
      </main>
    );
  }

  return <AppContent user={session.user} />;
}

function AppContent({
  user,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
}) {
  const router = useRouter();
  const expensesQuery = useQuery(api.expenses.listRecent, { limit: 6 });
  const emptyExpenses = useMemo(
    () => [] as NonNullable<typeof expensesQuery>,
    []
  );
  const expenses = expensesQuery ?? emptyExpenses;
  const hasProcessingExpense = useMemo(
    () => expenses.some((expense) => expense.status === "processing"),
    [expenses]
  );
  const generateUploadUrl = useMutation(api.receipts.generateUploadUrl);
  const createAndEnqueue = useMutation(api.receipts.createAndEnqueue);
  const updateExpense = useMutation(api.expenses.update);
  const removeExpense = useMutation(api.expenses.remove);
  const reprocessExpense = useAction(api.processing.reprocessExpense);
  const [, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [editingId, setEditingId] = useState<Id<"expenses"> | null>(null);
  const [editDraft, setEditDraft] = useState<{
    merchant: string;
    date: string;
    amount: string;
    currency: string;
    category: string;
    vatNumber: string;
    vatRate: string;
    vatAmount: string;
    notes: string;
  } | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [activeMonthIndex, setActiveMonthIndex] = useState(0);
  const [activePrevMonthIndex, setActivePrevMonthIndex] = useState(0);
  const [activeYearIndex, setActiveYearIndex] = useState(0);
  const [activePrevYearIndex, setActivePrevYearIndex] = useState(0);

  const [expenseSort, setExpenseSort] = useState<"upload" | "receipt">("upload");
  const sortedExpenses = useMemo(() => {
    if (expenseSort === "receipt") {
      return [...expenses].sort((a, b) => b.date.localeCompare(a.date));
    }
    return [...expenses].sort((a, b) => b.createdAt - a.createdAt);
  }, [expenseSort, expenses]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const previousMonth = previousMonthDate.getMonth();
  const previousMonthYear = previousMonthDate.getFullYear();
  const previousYear = currentYear - 1;

  const parsedExpenses = useMemo(
    () =>
      expenses.map((expense) => ({
        ...expense,
        receiptDate: new Date(`${expense.date}T00:00:00`),
      })),
    [expenses]
  );

  const monthExpenses = parsedExpenses.filter(
    (expense) =>
      expense.receiptDate.getFullYear() === currentYear &&
      expense.receiptDate.getMonth() === currentMonth
  );
  const previousMonthExpenses = parsedExpenses.filter(
    (expense) =>
      expense.receiptDate.getFullYear() === previousMonthYear &&
      expense.receiptDate.getMonth() === previousMonth
  );
  const yearExpenses = parsedExpenses.filter(
    (expense) => expense.receiptDate.getFullYear() === currentYear
  );
  const previousYearExpenses = parsedExpenses.filter(
    (expense) => expense.receiptDate.getFullYear() === previousYear
  );

  const buildCategoryTotals = (list: typeof parsedExpenses) => {
    const totals = new Map<string, number>();
    list.forEach((expense) => {
      totals.set(
        expense.category,
        (totals.get(expense.category) ?? 0) + expense.amount
      );
    });
    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  };

  const monthTotals = buildCategoryTotals(monthExpenses);
  const previousMonthTotals = buildCategoryTotals(previousMonthExpenses);
  const yearTotals = buildCategoryTotals(yearExpenses);
  const previousYearTotals = buildCategoryTotals(previousYearExpenses);

  const pieColors = [
    "#f6b352",
    "#f68657",
    "#4a90e2",
    "#50c9c3",
    "#9b59b6",
    "#27ae60",
    "#f39c12",
    "#e74c3c",
  ];

  const summarizeCurrencies = (list: typeof parsedExpenses) => {
    const currencies = Array.from(new Set(list.map((expense) => expense.currency)));
    if (currencies.length === 1) {
      return currencies[0];
    }
    return "Multiple";
  };

  const monthCurrency = summarizeCurrencies(monthExpenses);
  const previousMonthCurrency = summarizeCurrencies(previousMonthExpenses);
  const yearCurrency = summarizeCurrencies(yearExpenses);
  const previousYearCurrency = summarizeCurrencies(previousYearExpenses);
  const monthSum = monthTotals.reduce((acc, item) => acc + item.total, 0);
  const previousMonthSum = previousMonthTotals.reduce(
    (acc, item) => acc + item.total,
    0
  );
  const yearSum = yearTotals.reduce((acc, item) => acc + item.total, 0);
  const previousYearSum = previousYearTotals.reduce(
    (acc, item) => acc + item.total,
    0
  );

  const formatChange = (current: number, previous: number) => {
    if (previous === 0 && current === 0) {
      return "0%";
    }
    if (previous === 0) {
      return "+100%";
    }
    const delta = ((current - previous) / previous) * 100;
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta.toFixed(1)}%`;
  };

  const currencies = [
    { code: "USD", label: "US Dollar" },
    { code: "EUR", label: "Euro" },
    { code: "GBP", label: "British Pound" },
    { code: "CAD", label: "Canadian Dollar" },
    { code: "AUD", label: "Australian Dollar" },
    { code: "CHF", label: "Swiss Franc" },
    { code: "JPY", label: "Japanese Yen" },
    { code: "SEK", label: "Swedish Krona" },
    { code: "NOK", label: "Norwegian Krone" },
    { code: "DKK", label: "Danish Krone" },
  ];

  const renderActiveShape = (props: unknown) => {
    const {
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle,
      endAngle,
      fill,
    } = props as {
      cx: number;
      cy: number;
      innerRadius: number;
      outerRadius: number;
      startAngle: number;
      endAngle: number;
      fill: string;
    };
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    );
  };

  type PieProps = ComponentProps<typeof Pie>;
  type PieActiveProps = PieProps & {
    activeIndex?: number;
    activeShape?: (props: unknown) => ReactElement;
    onMouseEnter?: (_: unknown, index: number) => void;
  };
  const ActivePie = Pie as ComponentType<PieActiveProps>;

  const startUpload = async (file: File | null) => {
    if (!file || isProcessing) {
      return;
    }

    setSelectedFile(file);
    setStatusMessage(null);

    setIsProcessing(true);
    setStatusMessage("Uploading receipt...");
    try {
      const uploadUrl = await generateUploadUrl({});
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed.");
      }

      const { storageId } = (await uploadResponse.json()) as {
        storageId: Id<"_storage">;
      };

      await createAndEnqueue({
        storageId,
        filename: file.name,
        mimeType: file.type,
      });

      setSelectedFile(null);
      setStatusMessage("Receipt queued for processing.");
    } catch {
      setStatusMessage("Something went wrong. Try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    void startUpload(file);
  };

  useEffect(() => {
    if (!isCameraOpen) {
      return;
    }

    let isActive = true;
    setCameraError(null);

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (!isActive) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError("Unable to access camera.");
        setIsCameraOpen(false);
      }
    };

    startCamera();

    return () => {
      isActive = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isCameraOpen]);

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `receipt-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      void startUpload(file);
      setIsCameraOpen(false);
    }, "image/jpeg", 0.92);
  };

  const startEdit = (expense: (typeof expenses)[number]) => {
    setEditingId(expense._id);
    setEditDraft({
      merchant: expense.merchant,
      date: expense.date,
      amount: expense.amount.toString(),
      currency: expense.currency,
      category: expense.category,
      vatNumber: expense.vatNumber ?? "",
      vatRate: expense.vatRate?.toString() ?? "",
      vatAmount: expense.vatAmount?.toString() ?? "",
      notes: expense.notes ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = async (expenseId: Id<"expenses">) => {
    if (!editDraft) return;
    const amount = Number.parseFloat(editDraft.amount);
    if (Number.isNaN(amount)) {
      setStatusMessage("Amount must be a number.");
      return;
    }
    const vatRate = editDraft.vatRate.trim()
      ? Number.parseFloat(editDraft.vatRate)
      : undefined;
    if (editDraft.vatRate.trim() && Number.isNaN(vatRate)) {
      setStatusMessage("VAT rate must be a number.");
      return;
    }
    const vatAmount = editDraft.vatAmount.trim()
      ? Number.parseFloat(editDraft.vatAmount)
      : undefined;
    if (editDraft.vatAmount.trim() && Number.isNaN(vatAmount)) {
      setStatusMessage("VAT amount must be a number.");
      return;
    }
    await updateExpense({
      id: expenseId,
      merchant: editDraft.merchant,
      date: editDraft.date,
      amount,
      currency: editDraft.currency,
      category: editDraft.category,
      vatNumber: editDraft.vatNumber || undefined,
      vatRate,
      vatAmount,
      notes: editDraft.notes || undefined,
    });
    cancelEdit();
  };

  const handleRemoveExpense = async (expenseId: Id<"expenses">) => {
    const confirmed = window.confirm("Remove this expense?");
    if (!confirmed) return;
    await removeExpense({ id: expenseId });
  };

  const handleReprocessExpense = async (expenseId: Id<"expenses">) => {
    await reprocessExpense({ expenseId });
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.replace("/sign-in");
  };

  const displayName = user.name?.trim() || user.email?.trim() || "Account";
  const initials = displayName
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_#2a2318_0%,_transparent_55%)] opacity-80" />
      <div className="pointer-events-none absolute -left-32 top-40 h-72 w-72 rounded-full bg-[#5b4523]/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-12 h-72 w-72 rounded-full bg-[#1f3b4a]/50 blur-3xl" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-16 pt-14 sm:px-10">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.3em] text-foreground/60">
                Xpensai MVP
              </span>
              <Badge variant="muted">Auto-approved</Badge>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="flex items-center gap-3 rounded-full px-3 py-2"
              onClick={handleSignOut}
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold uppercase text-foreground/80">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials || "U"
                )}
              </span>
              <span className="max-w-[160px] truncate text-sm font-medium text-foreground">
                {displayName}
              </span>
            </Button>
          </div>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
            Turn receipts into categorized expenses in seconds.
          </h1>
          <p className="max-w-2xl text-base text-foreground/70 sm:text-lg">
            Upload a receipt, let the vision model extract fields, and review the
            auto-categorized expense. No approval queue in the MVP.
          </p>
        </header>

        <section className="grid gap-6">
          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle>
                {isProcessing || hasProcessingExpense
                  ? "Processing..."
                  : "Receipt intake"}
              </CardTitle>
              <CardDescription>
                {isProcessing || hasProcessingExpense
                  ? "Uploading and extracting fields from the receipt."
                  : "Drag and drop or upload receipts (PDF or image). We extract merchant, date, totals, and category in one pass."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-3">
                    <Input type="file" onChange={handleFileChange} disabled={isProcessing} />
                    <input
                      id="camera-input"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="sr-only"
                      disabled={isProcessing}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full px-6"
                      onClick={() => setIsCameraOpen(true)}
                      disabled={isProcessing}
                    >
                      Use camera
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-foreground/60">
                    <span>Supported: PDF, JPG, PNG</span>
                    <span>Max size: 10MB</span>
                    <span>Average processing: 6-9s</span>
                  </div>
                  {statusMessage ? (
                    <p className="text-xs text-foreground/70">{statusMessage}</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6">
          <Card className="bg-card/80">
            <CardHeader>
              <CardTitle>Recent expenses</CardTitle>
              <CardDescription>
                Extracted fields with confidence indicators.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                <span>Sort by:</span>
                <Button
                  size="sm"
                  variant={expenseSort === "upload" ? "default" : "outline"}
                  onClick={() => setExpenseSort("upload")}
                >
                  Upload date
                </Button>
                <Button
                  size="sm"
                  variant={expenseSort === "receipt" ? "default" : "outline"}
                  onClick={() => setExpenseSort("receipt")}
                >
                  Receipt date
                </Button>
              </div>
              {sortedExpenses.length === 0 && !isProcessing && !hasProcessingExpense ? (
                <p className="text-sm text-foreground/60">
                  No expenses yet. Upload a receipt to get started.
                </p>
              ) : (
                <div className="space-y-4">
                  {isProcessing && !hasProcessingExpense ? (
                    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                        <Skeleton className="h-8 w-24 rounded-full" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-6 w-24 rounded-full" />
                        <Skeleton className="h-6 w-32 rounded-full" />
                        <Skeleton className="h-6 w-28 rounded-full" />
                      </div>
                    </div>
                  ) : null}
                  {sortedExpenses.map((expense) => (
                    <div
                      key={expense._id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-4"
                    >
                      {expense.status === "processing" ? (
                          <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-40" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                            <Badge variant="muted">Processing</Badge>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-6 w-24 rounded-full" />
                            <Skeleton className="h-6 w-32 rounded-full" />
                            <Skeleton className="h-6 w-28 rounded-full" />
                          </div>
                        </div>
                      ) : editingId === expense._id && editDraft ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">Merchant</label>
                              <Input
                                value={editDraft.merchant}
                                onChange={(event) =>
                                  setEditDraft({
                                    ...editDraft,
                                    merchant: event.target.value,
                                  })
                                }
                                placeholder="Merchant"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">Receipt date</label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="h-10 justify-start rounded-md px-3 text-sm"
                                  >
                                    {editDraft.date
                                      ? format(parseISO(editDraft.date), "PPP")
                                      : "Pick a date"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start">
                                  <Calendar
                                    mode="single"
                                    selected={
                                      editDraft.date ? parseISO(editDraft.date) : undefined
                                    }
                                    onSelect={(date) => {
                                      if (!date) return;
                                      setEditDraft({
                                        ...editDraft,
                                        date: format(date, "yyyy-MM-dd"),
                                      });
                                    }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">Amount</label>
                              <Input
                                value={editDraft.amount}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, amount: event.target.value })
                                }
                                placeholder="Amount"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">Currency</label>
                              <Popover open={currencyOpen} onOpenChange={setCurrencyOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="h-10 justify-between rounded-md px-3 text-sm"
                                  >
                                    {editDraft.currency || "Select currency"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent align="start" className="p-0">
                                  <Command>
                                    <CommandInput placeholder="Search currency..." />
                                    <CommandList>
                                      <CommandEmpty>No currency found.</CommandEmpty>
                                      {currencies.map((currency) => (
                                        <CommandItem
                                          key={currency.code}
                                          onSelect={() => {
                                            setEditDraft({
                                              ...editDraft,
                                              currency: currency.code,
                                            });
                                            setCurrencyOpen(false);
                                          }}
                                        >
                                          {currency.code} · {currency.label}
                                        </CommandItem>
                                      ))}
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">VAT number</label>
                              <Input
                                value={editDraft.vatNumber}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, vatNumber: event.target.value })
                                }
                                placeholder="VAT number"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">VAT rate (%)</label>
                              <Input
                                value={editDraft.vatRate}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, vatRate: event.target.value })
                                }
                                placeholder="e.g. 20"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">VAT amount</label>
                              <Input
                                value={editDraft.vatAmount}
                                onChange={(event) =>
                                  setEditDraft({ ...editDraft, vatAmount: event.target.value })
                                }
                                placeholder="e.g. 12.34"
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs text-foreground/60">Category</label>
                              <select
                                value={editDraft.category}
                                onChange={(event) =>
                                  setEditDraft({
                                    ...editDraft,
                                    category: event.target.value,
                                  })
                                }
                                className="h-10 rounded-md border border-border bg-card px-3 text-sm"
                              >
                                {defaultCategories.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="text-xs text-foreground/60">Notes</label>
                            <Input
                              value={editDraft.notes}
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, notes: event.target.value })
                              }
                              placeholder="Notes"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => saveEdit(expense._id)}>
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold">{expense.merchant}</p>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-foreground/60 hover:text-foreground"
                                    onClick={() => handleReprocessExpense(expense._id)}
                                    aria-label="Reprocess expense"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-4 w-4"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 12a9 9 0 0 1 15-6" />
                                      <path d="M18 3v5h-5" />
                                      <path d="M21 12a9 9 0 0 1-15 6" />
                                      <path d="M6 21v-5h5" />
                                    </svg>
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-foreground/60 hover:text-foreground"
                                    onClick={() => handleRemoveExpense(expense._id)}
                                    aria-label="Remove expense"
                                  >
                                    ×
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-foreground/60">{expense.date}</p>
                            </div>
                            <p className="text-lg font-semibold">
                              {expense.currency} {expense.amount.toFixed(2)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                            <Badge variant="muted">{expense.category}</Badge>
                            {expense.vatNumber ? (
                              <span>VAT: {expense.vatNumber}</span>
                            ) : null}
                            {expense.vatRate !== undefined ? (
                              <span>VAT rate: {expense.vatRate.toFixed(2)}%</span>
                            ) : null}
                            {expense.vatAmount !== undefined ? (
                              <span>
                                VAT amount: {expense.currency} {expense.vatAmount.toFixed(2)}
                              </span>
                            ) : null}
                            {expense.confidence ? (
                              <span>
                                Confidence: {(expense.confidence * 100).toFixed(0)}%
                              </span>
                            ) : null}
                            <span>Auto-approved</span>
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-foreground/50">
                            <span>
                              Uploaded {new Date(expense.createdAt).toLocaleDateString()}
                            </span>
                            <div className="flex items-center gap-2">
                              {expense.receiptUrl ? (
                                <Button asChild size="sm" variant="outline">
                                  <a
                                    href={expense.receiptUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open receipt
                                  </a>
                                </Button>
                              ) : null}
                              <Button size="sm" variant="outline" onClick={() => startEdit(expense)}>
                                Edit
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Category spend</CardTitle>
              <CardDescription>Monthly and yearly breakdown.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6">
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Monthly comparison</p>
                      <p className="text-xs text-foreground/60">
                        Change {formatChange(monthSum, previousMonthSum)}
                      </p>
                    </div>
                    <span className="text-xs text-foreground/50">
                      {now.toLocaleString("default", { month: "long" })} vs{" "}
                      {previousMonthDate.toLocaleString("default", { month: "long" })}
                    </span>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-border bg-card/80 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">This month</p>
                        <span className="text-xs text-foreground/60">
                          {monthCurrency} {monthSum.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="h-48 w-48 shrink-0">
                          {monthTotals.length === 0 ? (
                            <div className="flex h-full w-full items-center justify-center rounded-full border border-border text-xs text-foreground/50">
                              No data
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                              <ActivePie
                                data={monthTotals}
                                dataKey="total"
                                nameKey="category"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                activeIndex={activeMonthIndex}
                                activeShape={renderActiveShape}
                                onMouseEnter={(_, index) => setActiveMonthIndex(index)}
                              >
                                  {monthTotals.map((_, index) => (
                                    <Cell
                                      key={`month-${index}`}
                                      fill={pieColors[index % pieColors.length]}
                                    />
                                  ))}
                              </ActivePie>
                                <Tooltip
                                  formatter={(value) =>
                                    `${monthCurrency} ${Number(value).toFixed(2)}`
                                  }
                                  wrapperStyle={{ color: "hsl(var(--foreground))" }}
                                  contentStyle={{
                                    background: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                    color: "hsl(var(--foreground))",
                                  }}
                                  labelStyle={{ color: "hsl(var(--foreground))" }}
                                  itemStyle={{ color: "hsl(var(--foreground))" }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                        <div className="flex-1 space-y-2 text-xs text-foreground/70">
                          {monthTotals.length === 0 ? (
                            <p>No expenses yet.</p>
                          ) : (
                            monthTotals.map((item) => (
                              <div key={item.category} className="flex justify-between">
                                <span>{item.category}</span>
                                <span>
                                  {monthCurrency} {item.total.toFixed(2)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card/80 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">Previous month</p>
                        <span className="text-xs text-foreground/60">
                          {previousMonthCurrency} {previousMonthSum.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="h-48 w-48 shrink-0">
                          {previousMonthTotals.length === 0 ? (
                            <div className="flex h-full w-full items-center justify-center rounded-full border border-border text-xs text-foreground/50">
                              No data
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                              <ActivePie
                                data={previousMonthTotals}
                                dataKey="total"
                                nameKey="category"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                activeIndex={activePrevMonthIndex}
                                activeShape={renderActiveShape}
                                onMouseEnter={(_, index) => setActivePrevMonthIndex(index)}
                              >
                                  {previousMonthTotals.map((_, index) => (
                                    <Cell
                                      key={`prev-month-${index}`}
                                      fill={pieColors[index % pieColors.length]}
                                    />
                                  ))}
                              </ActivePie>
                                <Tooltip
                                  formatter={(value) =>
                                    `${previousMonthCurrency} ${Number(value).toFixed(2)}`
                                  }
                                  wrapperStyle={{ color: "hsl(var(--foreground))" }}
                                  contentStyle={{
                                    background: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                    color: "hsl(var(--foreground))",
                                  }}
                                  labelStyle={{ color: "hsl(var(--foreground))" }}
                                  itemStyle={{ color: "hsl(var(--foreground))" }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                        <div className="flex-1 space-y-2 text-xs text-foreground/70">
                          {previousMonthTotals.length === 0 ? (
                            <p>No expenses yet.</p>
                          ) : (
                            previousMonthTotals.map((item) => (
                              <div key={item.category} className="flex justify-between">
                                <span>{item.category}</span>
                                <span>
                                  {previousMonthCurrency} {item.total.toFixed(2)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Yearly comparison</p>
                      <p className="text-xs text-foreground/60">
                        Change {formatChange(yearSum, previousYearSum)}
                      </p>
                    </div>
                    <span className="text-xs text-foreground/50">
                      {currentYear} vs {previousYear}
                    </span>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-lg border border-border bg-card/80 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">This year</p>
                        <span className="text-xs text-foreground/60">
                          {yearCurrency} {yearSum.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="h-48 w-48 shrink-0">
                          {yearTotals.length === 0 ? (
                            <div className="flex h-full w-full items-center justify-center rounded-full border border-border text-xs text-foreground/50">
                              No data
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                              <ActivePie
                                data={yearTotals}
                                dataKey="total"
                                nameKey="category"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                activeIndex={activeYearIndex}
                                activeShape={renderActiveShape}
                                onMouseEnter={(_, index) => setActiveYearIndex(index)}
                              >
                                  {yearTotals.map((_, index) => (
                                    <Cell
                                      key={`year-${index}`}
                                      fill={pieColors[index % pieColors.length]}
                                    />
                                  ))}
                              </ActivePie>
                                <Tooltip
                                  formatter={(value) =>
                                    `${yearCurrency} ${Number(value).toFixed(2)}`
                                  }
                                  wrapperStyle={{ color: "hsl(var(--foreground))" }}
                                  contentStyle={{
                                    background: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                    color: "hsl(var(--foreground))",
                                  }}
                                  labelStyle={{ color: "hsl(var(--foreground))" }}
                                  itemStyle={{ color: "hsl(var(--foreground))" }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                        <div className="flex-1 space-y-2 text-xs text-foreground/70">
                          {yearTotals.length === 0 ? (
                            <p>No expenses yet.</p>
                          ) : (
                            yearTotals.map((item) => (
                              <div key={item.category} className="flex justify-between">
                                <span>{item.category}</span>
                                <span>
                                  {yearCurrency} {item.total.toFixed(2)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card/80 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">Previous year</p>
                        <span className="text-xs text-foreground/60">
                          {previousYearCurrency} {previousYearSum.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="h-48 w-48 shrink-0">
                          {previousYearTotals.length === 0 ? (
                            <div className="flex h-full w-full items-center justify-center rounded-full border border-border text-xs text-foreground/50">
                              No data
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                              <ActivePie
                                data={previousYearTotals}
                                dataKey="total"
                                nameKey="category"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                activeIndex={activePrevYearIndex}
                                activeShape={renderActiveShape}
                                onMouseEnter={(_, index) => setActivePrevYearIndex(index)}
                              >
                                  {previousYearTotals.map((_, index) => (
                                    <Cell
                                      key={`prev-year-${index}`}
                                      fill={pieColors[index % pieColors.length]}
                                    />
                                  ))}
                              </ActivePie>
                                <Tooltip
                                  formatter={(value) =>
                                    `${previousYearCurrency} ${Number(value).toFixed(2)}`
                                  }
                                  wrapperStyle={{ color: "hsl(var(--foreground))" }}
                                  contentStyle={{
                                    background: "hsl(var(--card))",
                                    border: "1px solid hsl(var(--border))",
                                    borderRadius: "8px",
                                    color: "hsl(var(--foreground))",
                                  }}
                                  labelStyle={{ color: "hsl(var(--foreground))" }}
                                  itemStyle={{ color: "hsl(var(--foreground))" }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                        <div className="flex-1 space-y-2 text-xs text-foreground/70">
                          {previousYearTotals.length === 0 ? (
                            <p>No expenses yet.</p>
                          ) : (
                            previousYearTotals.map((item) => (
                              <div key={item.category} className="flex justify-between">
                                <span>{item.category}</span>
                                <span>
                                  {previousYearCurrency} {item.total.toFixed(2)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
      {isCameraOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">Capture receipt</p>
                <p className="text-xs text-foreground/60">
                  Align the receipt and tap capture.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsCameraOpen(false)}>
                Close
              </Button>
            </div>
            {cameraError ? (
              <p className="text-sm text-foreground/70">{cameraError}</p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-border bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="h-[360px] w-full object-contain"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={capturePhoto}>Capture</Button>
                  <Button variant="outline" onClick={() => setIsCameraOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

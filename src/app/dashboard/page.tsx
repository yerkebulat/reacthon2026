"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, RefreshCw, Calendar, Presentation, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface DashboardData {
  productivity: Array<{ date: string; avgPct: number; byHour: Array<{ hour: number; avgPct: number }> }>;
  millProductivityTph: Array<{ date: string; avgTph: number }>;
  downtime: Array<{
    date: string;
    totalMinutes: number;
    byEquipment: Record<string, number>;
    byClassification: Record<string, number>;
    reasons: Array<{ reason: string; minutes: number }>;
  }>;
  water: Array<{ date: string; actual: number; nominal: number; meterReading: number; hourly: number }>;
  openHazards: number;
}

interface SignalData {
  productivity: { signal: string; currentPct: number; targetPct: number };
  downtime: { signal: string; totalMinutes: number; topReasons: Array<{ reason: string; minutes: number }> };
  water: { signal: string; actual: number; nominal: number; overPct: number };
  priorityItems: Array<{
    id: string;
    type: string;
    score: number;
    description: string;
    signal: string;
    value: number;
    unit: string;
    date: string;
  }>;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const SIGNAL_COLORS = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444" };

function SignalBadge({ signal }: { signal: string }) {
  const variant = signal === "green" ? "success" : signal === "yellow" ? "warning" : "danger";
  const label = signal === "green" ? "Норма" : signal === "yellow" ? "Внимание" : "Критично";
  return <Badge variant={variant}>{label}</Badge>;
}

// Helper function to format date as YYYY-MM-DD
function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Date range presets
type DatePreset = "today" | "yesterday" | "last7days" | "last30days" | "thisMonth" | "lastMonth" | "all";

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const to = formatDateISO(today);

  switch (preset) {
    case "today":
      return { from: to, to };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = formatDateISO(yesterday);
      return { from: yesterdayStr, to: yesterdayStr };
    }
    case "last7days": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: formatDateISO(weekAgo), to };
    }
    case "last30days": {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { from: formatDateISO(monthAgo), to };
    }
    case "thisMonth": {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatDateISO(firstOfMonth), to };
    }
    case "lastMonth": {
      const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: formatDateISO(firstOfLastMonth), to: formatDateISO(lastOfLastMonth) };
    }
    case "all":
    default:
      return { from: "", to: "" };
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [signals, setSignals] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [shift, setShift] = useState("all");
  const [activePreset, setActivePreset] = useState<DatePreset>("all");
  const [presentationMode, setPresentationMode] = useState(false);

  // ESC key to exit presentation mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && presentationMode) {
        setPresentationMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentationMode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (shift !== "all") params.set("shift", shift);

      const [dashboardRes, signalsRes] = await Promise.all([
        fetch(`/api/dashboard?${params}`),
        fetch(`/api/signals?${params}`),
      ]);

      const dashboardData = await dashboardRes.json();
      const signalsData = await signalsRes.json();

      setData(dashboardData);
      setSignals(signalsData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = useCallback((preset: DatePreset) => {
    const { from, to } = getDateRange(preset);
    setFromDate(from);
    setToDate(to);
    setActivePreset(preset);
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  // Prepare chart data
  const productivityChartData = data?.productivity?.map((p) => ({
    date: p.date.split("-").slice(1).join("/"),
    productivity: p.avgPct.toFixed(1),
  })) || [];

  const millProductivityChartData = data?.millProductivityTph?.map((p) => ({
    date: p.date.split("-").slice(1).join("/"),
    throughput: p.avgTph.toFixed(1),
  })) || [];

  const waterChartData = data?.water?.map((w) => ({
    date: w.date.split("-").slice(1).join("/"),
    actual: w.actual,
    nominal: w.nominal,
  })) || [];

  // Aggregate downtime by equipment
  const downtimeByEquipment: Record<string, number> = {};
  data?.downtime?.forEach((d) => {
    Object.entries(d.byEquipment || {}).forEach(([eq, min]) => {
      downtimeByEquipment[eq] = (downtimeByEquipment[eq] || 0) + min;
    });
  });
  const downtimeEquipmentData = Object.entries(downtimeByEquipment)
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6);

  // Aggregate downtime by classification
  const downtimeByClass: Record<string, number> = {};
  data?.downtime?.forEach((d) => {
    Object.entries(d.byClassification || {}).forEach(([cls, min]) => {
      downtimeByClass[cls] = (downtimeByClass[cls] || 0) + min;
    });
  });
  const classificationData = Object.entries(downtimeByClass).map(([name, value]) => ({
    name: name === "M" ? "Механическая" : name === "E" ? "Электрическая" : name === "T" ? "Технологическая" : "Погодные",
    value,
  }));

  // Aggregate top downtime reasons
  const reasonMinutes: Record<string, number> = {};
  data?.downtime?.forEach((d) => {
    (d.reasons || []).forEach((r) => {
      const shortReason = r.reason.substring(0, 50);
      reasonMinutes[shortReason] = (reasonMinutes[shortReason] || 0) + r.minutes;
    });
  });
  const topReasons = Object.entries(reasonMinutes)
    .map(([reason, minutes]) => ({ reason, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  const totalDowntime = data?.downtime?.reduce((sum, d) => sum + d.totalMinutes, 0) || 0;
  const avgProductivity = data?.productivity?.length
    ? data.productivity.reduce((sum, p) => sum + p.avgPct, 0) / data.productivity.length
    : 0;
  const avgMillProductivityTph = data?.millProductivityTph?.length
    ? data.millProductivityTph.reduce((sum, p) => sum + p.avgTph, 0) / data.millProductivityTph.length
    : 0;
  const latestWater = data?.water?.[data.water.length - 1];
  const waterOverNominal = latestWater && latestWater.nominal > 0
    ? ((latestWater.actual - latestWater.nominal) / latestWater.nominal * 100)
    : 0;

  // Presentation Mode View
  if (presentationMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8">
        {/* Close button */}
        <button
          onClick={() => setPresentationMode(false)}
          className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <Image src="/logo_qazyna.png" alt="Qazyna" width={100} height={100} className="rounded-lg" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Qazyna Dashboard</h1>
          <p className="text-slate-400">
            {new Date().toLocaleDateString("ru-RU", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric"
            })}
          </p>
        </div>

        {/* Main KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-8 max-w-6xl mx-auto mb-12">
          {/* Density */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center">
            <div className="text-6xl font-bold mb-2" style={{
              color: signals?.productivity?.signal === "green" ? "#22c55e" :
                     signals?.productivity?.signal === "yellow" ? "#f59e0b" : "#ef4444"
            }}>
              {avgProductivity.toFixed(1)}%
            </div>
            <div className="text-xl text-slate-300">Плотность</div>
            <div className="text-sm text-slate-400 mt-2">Цель: {signals?.productivity?.targetPct || 65}%</div>
          </div>

          {/* Mill Productivity TPH */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center">
            <div className="text-6xl font-bold mb-2 text-emerald-400">
              {avgMillProductivityTph.toFixed(1)}
            </div>
            <div className="text-xl text-slate-300">Производительность тн/ч</div>
            <div className="text-sm text-slate-400 mt-2">Среднее за период</div>
          </div>

          {/* Downtime */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center">
            <div className="text-6xl font-bold mb-2" style={{
              color: signals?.downtime?.signal === "green" ? "#22c55e" :
                     signals?.downtime?.signal === "yellow" ? "#f59e0b" : "#ef4444"
            }}>
              {totalDowntime.toFixed(2)}
            </div>
            <div className="text-xl text-slate-300">Простой (мин)</div>
            <div className="text-sm text-slate-400 mt-2">За период</div>
          </div>

          {/* Water */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center">
            <div className="text-6xl font-bold mb-2" style={{
              color: signals?.water?.signal === "green" ? "#22c55e" :
                     signals?.water?.signal === "yellow" ? "#f59e0b" : "#ef4444"
            }}>
              {waterOverNominal > 0 ? "+" : ""}{waterOverNominal.toFixed(1)}%
            </div>
            <div className="text-xl text-slate-300">Расход воды</div>
            <div className="text-sm text-slate-400 mt-2">От нормы</div>
          </div>

          {/* HSE */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-8 text-center">
            <div className="text-6xl font-bold mb-2" style={{
              color: (data?.openHazards || 0) === 0 ? "#22c55e" : "#ef4444"
            }}>
              {data?.openHazards || 0}
            </div>
            <div className="text-xl text-slate-300">Открытые риски</div>
            <div className="text-sm text-slate-400 mt-2">HSE инциденты</div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Productivity Chart */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
            <h3 className="text-xl font-semibold mb-4 text-center">Плотность</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productivityChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="productivity"
                    name="Плотность %"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Mill Productivity TPH Chart */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
            <h3 className="text-xl font-semibold mb-4 text-center">Производительность мельниц тн/ч</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={millProductivityChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis dataKey="date" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="throughput"
                    name="тн/ч"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Downtime by Equipment */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6">
            <h3 className="text-xl font-semibold mb-4 text-center">Простой по оборудованию</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downtimeEquipmentData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis type="number" stroke="#94a3b8" />
                  <YAxis dataKey="name" type="category" width={80} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="minutes" name="Минуты" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-slate-500 text-sm">
          Нажмите ESC или ✕ для выхода из режима презентации
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Image src="/logo_qazyna.png" alt="Qazyna" width={40} height={40} className="rounded" />
            <h1 className="text-2xl font-bold">Панель управления</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setPresentationMode(true)} variant="outline">
              <Presentation className="h-4 w-4 mr-2" />
              Презентация
            </Button>
            <Button onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Обновить
            </Button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="px-6 py-4 bg-white border-b">
        {/* Quick date presets */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground mr-2">Период:</span>
          {[
            { key: "today" as DatePreset, label: "Сегодня" },
            { key: "yesterday" as DatePreset, label: "Вчера" },
            { key: "last7days" as DatePreset, label: "7 дней" },
            { key: "last30days" as DatePreset, label: "30 дней" },
            { key: "thisMonth" as DatePreset, label: "Этот месяц" },
            { key: "lastMonth" as DatePreset, label: "Прошлый месяц" },
            { key: "all" as DatePreset, label: "Все данные" },
          ].map((preset) => (
            <Button
              key={preset.key}
              variant={activePreset === preset.key ? "default" : "outline"}
              size="sm"
              onClick={() => {
                applyPreset(preset.key);
              }}
              className="text-xs"
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {/* Custom date range and filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>С:</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setActivePreset("all");
              }}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label>По:</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setActivePreset("all");
              }}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label>Смена:</Label>
            <Select value={shift} onValueChange={setShift}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="1">Смена 1</SelectItem>
                <SelectItem value="2">Смена 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={fetchData}>Применить</Button>
          {(fromDate || toDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setActivePreset("all");
              }}
            >
              Сбросить
            </Button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Плотность
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{avgProductivity.toFixed(1)}%</div>
                {signals?.productivity && <SignalBadge signal={signals.productivity.signal} />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Цель: {signals?.productivity?.targetPct || 65}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Производительность тн/ч
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{avgMillProductivityTph.toFixed(1)}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Среднее за период
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Общий простой
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{totalDowntime.toFixed(2)} мин</div>
                {signals?.downtime && <SignalBadge signal={signals.downtime.signal} />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                За выбранный период
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Расход воды
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">
                  {waterOverNominal > 0 ? "+" : ""}{waterOverNominal.toFixed(1)}%
                </div>
                {signals?.water && <SignalBadge signal={signals.water.signal} />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Отклонение от нормы
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Открытые риски
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{data?.openHazards || 0}</div>
                <Badge variant={data?.openHazards ? "danger" : "success"}>
                  {data?.openHazards ? "Требуют внимания" : "Все закрыты"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                HSE инцидентов
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Charts Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Productivity Chart */}
            <Card>
              <CardHeader>
              <CardTitle>Плотность</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={productivityChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="productivity"
                        name="Плотность %"
                        stroke="#3b82f6"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Mill Productivity TPH Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Производительность мельниц тн/ч</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={millProductivityChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="throughput"
                        name="тн/ч"
                        stroke="#10b981"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Water Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Расход воды</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={waterChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="Фактический"
                        stroke="#ef4444"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="nominal"
                        name="Номинальный"
                        stroke="#22c55e"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Downtime Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Простой по оборудованию</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={downtimeEquipmentData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={80} />
                        <Tooltip />
                        <Bar dataKey="minutes" name="Минуты" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Классификация простоев</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={classificationData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {classificationData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Priority Panel */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Приоритетные задачи</CardTitle>
              </CardHeader>
              <CardContent>
                {signals?.priorityItems?.length ? (
                  <div className="space-y-3">
                    {signals.priorityItems.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border"
                        style={{
                          borderLeftWidth: 4,
                          borderLeftColor: SIGNAL_COLORS[item.signal as keyof typeof SIGNAL_COLORS],
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant={item.signal === "red" ? "danger" : item.signal === "yellow" ? "warning" : "success"}>
                            {item.type === "downtime" ? "Простой" : item.type === "water" ? "Вода" : "Плотность"}
                          </Badge>
                          <span className="text-sm text-muted-foreground">{item.date}</span>
                        </div>
                        <p className="text-sm">{item.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Нет приоритетных задач
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Топ причин простоев</CardTitle>
              </CardHeader>
              <CardContent>
                {topReasons.length ? (
                  <div className="space-y-2">
                    {topReasons.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="truncate flex-1" title={r.reason}>
                          {r.reason}
                        </span>
                        <span className="font-medium ml-2">{r.minutes} мин</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">
                    Нет данных
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Signal Legend */}
            <Card>
              <CardHeader>
                <CardTitle>Легенда сигналов</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-green-500" />
                    <span>Норма - показатели в пределах допуска</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-yellow-500" />
                    <span>Внимание - небольшое отклонение</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-red-500" />
                    <span>Критично - требуется вмешательство</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

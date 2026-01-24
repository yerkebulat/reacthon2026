"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface Hazard {
  id: string;
  date: string;
  sourceType: string;
  description: string;
  severity: string;
  status: string;
  tags: string | null;
  createdAt: string;
}

interface HazardsData {
  hazards: Hazard[];
  daysSinceLastSevere: number | null;
  severityCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  recurringHazards: Array<{ tag: string; count: number }>;
}

const SEVERITY_COLORS = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const SEVERITY_LABELS = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const SOURCE_LABELS = {
  tech_journal: "Техжурнал",
  downtime: "Простои",
  manual: "Вручную",
};

export default function HazardsPage() {
  const [data, setData] = useState<HazardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<{
    severity: string | null;
    detected: string[];
    confidence?: number;
  } | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [confidence, setConfidence] = useState("0.4");
  const [newHazard, setNewHazard] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    severity: "medium",
    tags: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/hazards");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch hazards:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddHazard = async () => {
    try {
      const response = await fetch("/api/hazards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newHazard),
      });

      if (response.ok) {
        setShowAddDialog(false);
        setDetectResult(null);
        setPhotoFile(null);
        setNewHazard({
          date: new Date().toISOString().split("T")[0],
          description: "",
          severity: "medium",
          tags: "",
        });
        fetchData();
      }
    } catch (error) {
      console.error("Failed to add hazard:", error);
    }
  };

  const handlePhotoDetect = async () => {
    if (!photoFile) return;
    setDetecting(true);
    setDetectResult(null);
    try {
      const formData = new FormData();
      formData.append("file", photoFile);
      formData.append("confidence", confidence);

      const response = await fetch("/api/hazards/detect", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (response.ok) {
        setDetectResult(result);
        if (result.severity) {
          setNewHazard((prev) => ({
            ...prev,
            severity: result.severity,
            tags: result.detected?.join(", ") || prev.tags,
            description: result.detected?.length
              ? `${prev.description ? `${prev.description}\n` : ""}Авто-детекция: ${result.detected.join(", ")}`
              : prev.description,
          }));
        }
      } else {
        setDetectResult({
          severity: null,
          detected: [],
        });
      }
    } catch (error) {
      console.error("Failed to detect hazards:", error);
      setDetectResult({
        severity: null,
        detected: [],
      });
    } finally {
      setDetecting(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await fetch("/api/hazards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      fetchData();
    } catch (error) {
      console.error("Failed to update hazard:", error);
    }
  };

  const severityPieData = data
    ? Object.entries(data.severityCounts).map(([severity, count]) => ({
        name: SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] || severity,
        value: count,
        color: SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] || "#gray",
      }))
    : [];

  const openCount = data?.statusCounts.open || 0;
  const closedCount = data?.statusCounts.closed || 0;
  const totalCount = openCount + closedCount;

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
            <div>
              <h1 className="text-2xl font-bold">HSE Риски</h1>
              <p className="text-sm text-muted-foreground">
                Мониторинг инцидентов безопасности
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={fetchData} variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Обновить
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить инцидент
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новый инцидент</DialogTitle>
                  <DialogDescription>
                    Зарегистрируйте новый инцидент или потенциальную угрозу безопасности
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="photo">Фото инцидента (не сохраняется)</Label>
                    <Input
                      id="photo"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        setPhotoFile(e.target.files?.[0] || null);
                        setDetectResult(null);
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Label htmlFor="confidence" className="text-sm text-muted-foreground">
                        Порог уверенности
                      </Label>
                      <Input
                        id="confidence"
                        type="number"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={confidence}
                        onChange={(e) => setConfidence(e.target.value)}
                        className="w-24"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handlePhotoDetect}
                        disabled={!photoFile || detecting}
                      >
                        {detecting ? "Анализ..." : "Анализировать фото"}
                      </Button>
                      {detectResult && (
                        <span className="text-sm text-muted-foreground">
                          {detectResult.detected.length
                            ? `Обнаружено: ${detectResult.detected.join(", ")}`
                            : "Объекты не найдены"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date">Дата</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newHazard.date}
                      onChange={(e) =>
                        setNewHazard({ ...newHazard, date: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Описание</Label>
                    <Textarea
                      id="description"
                      placeholder="Опишите инцидент или угрозу..."
                      value={newHazard.description}
                      onChange={(e) =>
                        setNewHazard({ ...newHazard, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="severity">Серьезность</Label>
                    <Select
                      value={newHazard.severity}
                      onValueChange={(value) =>
                        setNewHazard({ ...newHazard, severity: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Низкий</SelectItem>
                        <SelectItem value="medium">Средний</SelectItem>
                        <SelectItem value="high">Высокий</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tags">Теги (через запятую)</Label>
                    <Input
                      id="tags"
                      placeholder="безопасность, оборудование..."
                      value={newHazard.tags}
                      onChange={(e) =>
                        setNewHazard({ ...newHazard, tags: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                    Отмена
                  </Button>
                  <Button
                    onClick={handleAddHazard}
                    disabled={!newHazard.description}
                  >
                    Добавить
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Дней без тяжелых инцидентов
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {data?.daysSinceLastSevere ?? "N/A"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Открытых инцидентов
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">{openCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Закрытых инцидентов
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{closedCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Всего за 30 дней
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalCount}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Hazards Table */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Последние инциденты</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Описание</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Серьезность</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.hazards.map((hazard) => (
                      <TableRow key={hazard.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(hazard.date).toLocaleDateString("ru-RU")}
                        </TableCell>
                        <TableCell className="max-w-xs truncate" title={hazard.description}>
                          {hazard.description}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {SOURCE_LABELS[hazard.sourceType as keyof typeof SOURCE_LABELS] ||
                              hazard.sourceType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              hazard.severity === "high"
                                ? "danger"
                                : hazard.severity === "medium"
                                ? "warning"
                                : "success"
                            }
                          >
                            {SEVERITY_LABELS[hazard.severity as keyof typeof SEVERITY_LABELS]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={hazard.status === "open" ? "destructive" : "secondary"}
                          >
                            {hazard.status === "open" ? "Открыт" : "Закрыт"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {hazard.status === "open" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateStatus(hazard.id, "closed")}
                            >
                              Закрыть
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUpdateStatus(hazard.id, "open")}
                            >
                              Открыть
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!data?.hazards || data.hazards.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Нет зарегистрированных инцидентов
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Severity Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Распределение по серьезности</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {severityPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Recurring Hazards */}
            <Card>
              <CardHeader>
                <CardTitle>Повторяющиеся угрозы</CardTitle>
              </CardHeader>
              <CardContent>
                {data?.recurringHazards && data.recurringHazards.length > 0 ? (
                  <div className="space-y-2">
                    {data.recurringHazards.map((h, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Badge variant="outline">{h.tag}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {h.count} раз
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Нет данных о повторяющихся угрозах
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Safety Tips */}
            <Card>
              <CardHeader>
                <CardTitle>Напоминание</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    Регистрируйте все инциденты своевременно
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    Используйте СИЗ на рабочем месте
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    Сообщайте о потенциальных угрозах
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UploadResult {
  success: boolean;
  uploadId?: string;
  rowsParsed?: number;
  warningsCount?: number;
  error?: string;
  details?: string;
}

interface FileUploadState {
  file: File | null;
  status: "idle" | "uploading" | "success" | "error";
  result: UploadResult | null;
}

const FILE_TYPES = [
  {
    id: "tech_journal",
    title: "Технический журнал",
    description: "Производительность мельниц и простои по сменам",
    expectedFile: "technical_journal.xlsx",
    color: "blue",
  },
  {
    id: "water",
    title: "Расход воды",
    description: "Ежедневное потребление воды и показания счетчиков",
    expectedFile: "water_consumption.xlsx",
    color: "green",
  },
  {
    id: "downtime",
    title: "История простоев",
    description: "Детальные данные о простоях по месяцам",
    expectedFile: "downtime.xlsx",
    color: "orange",
  },
];

function FileUploadBlock({
  type,
  state,
  onFileSelect,
  onUpload,
}: {
  type: (typeof FILE_TYPES)[0];
  state: FileUploadState;
  onFileSelect: (file: File) => void;
  onUpload: () => void;
}) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
    disabled: state.status === "uploading",
  });

  const borderColor =
    type.color === "blue"
      ? "border-blue-500"
      : type.color === "green"
      ? "border-green-500"
      : "border-orange-500";

  const bgColor =
    type.color === "blue"
      ? "bg-blue-50"
      : type.color === "green"
      ? "bg-green-50"
      : "bg-orange-50";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          {type.title}
        </CardTitle>
        <CardDescription>{type.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            isDragActive ? `${borderColor} ${bgColor}` : "border-gray-300 hover:border-gray-400"
          } ${state.status === "uploading" ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getInputProps()} />
          {state.file ? (
            <div className="space-y-2">
              <FileSpreadsheet className="h-10 w-10 mx-auto text-gray-400" />
              <p className="font-medium">{state.file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(state.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="h-10 w-10 mx-auto text-gray-400" />
              <p className="text-muted-foreground">
                {isDragActive
                  ? "Отпустите файл здесь"
                  : "Перетащите файл или нажмите для выбора"}
              </p>
              <p className="text-xs text-muted-foreground">
                Ожидается: {type.expectedFile}
              </p>
            </div>
          )}
        </div>

        {state.file && state.status !== "success" && (
          <Button
            className="w-full mt-4"
            onClick={onUpload}
            disabled={state.status === "uploading"}
          >
            {state.status === "uploading" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Загрузка...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Загрузить и обработать
              </>
            )}
          </Button>
        )}

        {state.result && (
          <div
            className={`mt-4 p-4 rounded-lg ${
              state.result.success ? "bg-green-50" : "bg-red-50"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {state.result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span
                className={`font-medium ${
                  state.result.success ? "text-green-700" : "text-red-700"
                }`}
              >
                {state.result.success ? "Успешно загружено" : "Ошибка загрузки"}
              </span>
            </div>
            {state.result.success ? (
              <div className="space-y-1 text-sm">
                <p>Обработано строк: {state.result.rowsParsed}</p>
                {state.result.warningsCount! > 0 && (
                  <p className="text-yellow-600">
                    Предупреждений: {state.result.warningsCount}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-red-600">
                {state.result.error}: {state.result.details}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function UploadPage() {
  const [uploadStates, setUploadStates] = useState<Record<string, FileUploadState>>(
    FILE_TYPES.reduce(
      (acc, type) => ({
        ...acc,
        [type.id]: { file: null, status: "idle", result: null },
      }),
      {}
    )
  );

  const handleFileSelect = (typeId: string, file: File) => {
    setUploadStates((prev) => ({
      ...prev,
      [typeId]: { file, status: "idle", result: null },
    }));
  };

  const handleUpload = async (typeId: string) => {
    const state = uploadStates[typeId];
    if (!state.file) return;

    setUploadStates((prev) => ({
      ...prev,
      [typeId]: { ...prev[typeId], status: "uploading" },
    }));

    try {
      const formData = new FormData();
      formData.append("file", state.file);
      formData.append("type", typeId);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result: UploadResult = await response.json();

      setUploadStates((prev) => ({
        ...prev,
        [typeId]: {
          ...prev[typeId],
          status: result.success ? "success" : "error",
          result,
        },
      }));
    } catch (error) {
      setUploadStates((prev) => ({
        ...prev,
        [typeId]: {
          ...prev[typeId],
          status: "error",
          result: {
            success: false,
            error: "Ошибка сети",
            details: error instanceof Error ? error.message : "Неизвестная ошибка",
          },
        },
      }));
    }
  };

  const successCount = Object.values(uploadStates).filter(
    (s) => s.status === "success"
  ).length;

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
            <div>
              <h1 className="text-2xl font-bold">Загрузка данных</h1>
              <p className="text-sm text-muted-foreground">
                Загрузите Excel-файлы для обновления данных
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={successCount === 3 ? "success" : "secondary"}>
              {successCount}/3 загружено
            </Badge>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          {/* Instructions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Инструкция по загрузке</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Подготовьте Excel-файлы в требуемом формате</li>
                <li>Загрузите каждый файл в соответствующий блок</li>
                <li>Дождитесь завершения обработки каждого файла</li>
                <li>Проверьте результаты и устраните ошибки при необходимости</li>
              </ol>
            </CardContent>
          </Card>

          {/* Upload Blocks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FILE_TYPES.map((type) => (
              <FileUploadBlock
                key={type.id}
                type={type}
                state={uploadStates[type.id]}
                onFileSelect={(file) => handleFileSelect(type.id, file)}
                onUpload={() => handleUpload(type.id)}
              />
            ))}
          </div>

          {/* Summary */}
          {successCount > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Сводка загрузки</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {FILE_TYPES.map((type) => {
                    const state = uploadStates[type.id];
                    if (state.status !== "success" || !state.result) return null;
                    return (
                      <div
                        key={type.id}
                        className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="font-medium">{type.title}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {state.result.rowsParsed} строк
                        </span>
                      </div>
                    );
                  })}
                </div>
                {successCount === 3 && (
                  <Link href="/dashboard">
                    <Button className="w-full mt-4">
                      Перейти к панели управления
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo_qazyna.png"
              alt="Qazyna Logo"
              width={240}
              height={240}
              className="rounded-lg"
            />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">Qazyna</h1>
          <p className="text-xl text-slate-300">
            Аналитическая панель обогатительной фабрики
          </p>
          <p className="text-slate-400 mt-2">
            Мониторинг производительности, простоев и безопасности в реальном времени
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/dashboard" className="block">
            <Card className="h-full hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer bg-slate-800 border-slate-700">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
                  <LayoutDashboard className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-white text-xl">Панель управления</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-slate-400">
                  Просмотр KPI, графиков производительности, простоев и потребления воды
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/upload" className="block">
            <Card className="h-full hover:shadow-lg hover:shadow-green-500/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer bg-slate-800 border-slate-700">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mb-4">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-white text-xl">Загрузка данных</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-slate-400">
                  Ежедневная загрузка Excel-файлов: техжурнал, вода, простои
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link href="/hazards" className="block">
            <Card className="h-full hover:shadow-lg hover:shadow-red-500/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer bg-slate-800 border-slate-700">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-white text-xl">HSE Риски</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-center text-slate-400">
                  Мониторинг инцидентов безопасности и управление рисками
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="mt-12 text-center text-slate-500 text-sm">
          <p>Reacthon 2026</p>
        </div>
      </div>
    </div>
  );
}

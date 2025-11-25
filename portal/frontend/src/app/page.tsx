"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import JSZip from "jszip";

import {
  PipelineMeta,
  JobResponse,
  fetchPipelines,
  fetchJobs,
  createJob,
  deleteJob,
  downloadArchive,
  downloadArtifact,
  login,
  register,
} from "@/lib/api";
import { triggerDownload } from "@/lib/download";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { NglViewer } from "@/components/NglViewer";

export default function HomePage() {
  const [token, setToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("portal-token");
    if (saved) {
      setToken(saved);
    }
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const data = await login(username, password);
      setToken(data.access_token);
      window.localStorage.setItem("portal-token", data.access_token);
    } catch (error: any) {
      setAuthError(error.message || "로그인 중 오류가 발생했습니다.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (username: string, password: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await register(username, password);
      await handleLogin(username, password);
    } catch (error: any) {
      setAuthError(error.message || "회원가입 중 오류가 발생했습니다.");
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem("portal-token");
    setToken(null);
  };

  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-white px-6 py-12">
        <div className="w-full max-w-4xl rounded-3xl bg-white p-12 shadow-2xl ring-1 ring-slate-100">
          <h1 className="text-3xl font-semibold text-slate-900">RunPod 구조 분석 허브</h1>
          <p className="mt-2 text-slate-600">하나의 계정으로 AlphaFold2, DiffDock, PHASTEST를 관리하세요.</p>
          <AuthSwitcher
            mode={authMode}
            onModeChange={setAuthMode}
            onLogin={handleLogin}
            onRegister={handleRegister}
            loading={authLoading}
            error={authError}
          />
        </div>
      </main>
    );
  }

  return <Dashboard token={token} onLogout={handleLogout} />;
}

type AuthProps = {
  mode: "login" | "register";
  onModeChange: (mode: "login" | "register") => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
};

function AuthSwitcher({ mode, onModeChange, onLogin, onRegister, loading, error }: AuthProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register" && password !== confirm) {
      alert("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (mode === "login") {
      onLogin(username, password);
    } else {
      onRegister(username, password);
    }
  };

  return (
    <div className="mt-8 grid gap-8 md:grid-cols-2">
      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-100 p-8">
        <div>
          <label className="text-sm font-semibold text-slate-600">아이디</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-600">비밀번호</label>
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {mode === "register" && (
          <div>
            <label className="text-sm font-semibold text-slate-600">비밀번호 확인</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-lg shadow-brand-200 transition hover:bg-brand-500 disabled:opacity-50"
        >
          {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </form>
      <div className="rounded-2xl bg-slate-50 p-8">
        <p className="text-sm font-semibold text-brand-600">한 곳에서 세 가지 파이프라인</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">AlphaFold2 · DiffDock · PHASTEST</h2>
        <p className="mt-4 text-slate-600">
          RunPod Serverless 위에 구축된 세 개의 워크로드를 클릭 몇 번으로 실행합니다. 업로드한 데이터와 결과는 암호화된 파일 시스템에 저장되며, 7일 후 자동으로 정리됩니다.
        </p>
        <div className="mt-6 space-y-4 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">1</span>
            <div>
              <p className="font-semibold">파일 또는 폴더 업로드</p>
              <p>웹 폴더 업로드 버튼으로 실험 세트를 한 번에 올릴 수 있습니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">2</span>
            <div>
              <p className="font-semibold">실시간 상태 추적</p>
              <p>RunPod job ID와 진행 상태를 초 단위로 확인하세요.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">3</span>
            <div>
              <p className="font-semibold">결과 뷰어</p>
              <p>Protein viewer, DiffDock pose 리스트, PHASTEST HTML 보고서를 웹에서 바로 확인합니다.</p>
            </div>
          </div>
        </div>
        <div className="mt-8 flex items-center gap-3 text-sm text-slate-500">
          <span className="font-semibold">계정이 없나요?</span>
          <button className="text-brand-600 underline" onClick={() => onModeChange(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "회원가입으로 전환" : "로그인으로 전환"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DashboardProps = {
  token: string;
  onLogout: () => void;
};

function Dashboard({ token, onLogout }: DashboardProps) {
  const { data: pipelineData } = useSWR(token ? ["pipelines", token] : null, ([, t]) => fetchPipelines(t as string));
  const { data: jobs, mutate: refreshJobs, isLoading: jobsLoading } = useSWR(
    token ? ["jobs", token] : null,
    ([, t]) => fetchJobs(t as string)
  );

  const [selectedPipelineKey, setSelectedPipelineKey] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sequence, setSequence] = useState("");
  const [title, setTitle] = useState("새로운 작업");
  const [notes, setNotes] = useState("");
  const [downloadDir, setDownloadDir] = useState("/data/results");
  const [paramState, setParamState] = useState<Record<string, string>>({ model_preset: "monomer", db_preset: "full_dbs" });
  const [uploads, setUploads] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const retentionDays = pipelineData?.retentionDays ?? 7;
  const pipelines = pipelineData?.pipelines ?? [];
  const selectedPipeline = pipelines.find((p) => p.key === selectedPipelineKey) ?? pipelines[0];
  const selectedJob = useMemo(() => jobs?.find((job) => job.id === selectedJobId) ?? jobs?.[0], [jobs, selectedJobId]);

  useEffect(() => {
    if (pipelines.length && !selectedPipelineKey) {
      setSelectedPipelineKey(pipelines[0].key);
    }
  }, [pipelines, selectedPipelineKey]);

  useEffect(() => {
    if (jobs?.length && !selectedJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId]);

  const handleParamChange = (name: string, value: string) => {
    setParamState((prev) => ({ ...prev, [name]: value }));
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    setUploads((prev) => [...prev, ...Array.from(files)]);
  };

  const handleFolder = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const zip = new JSZip();
    Array.from(files).forEach((file) => {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      zip.file(relative, file);
    });
    const first = files[0] as File & { webkitRelativePath?: string };
    const folderName = (first.webkitRelativePath && first.webkitRelativePath.split("/")[0]) || first.name || "folder";
    const blob = await zip.generateAsync({ type: "blob" });
    const zippedFile = new File([blob], `${folderName}.zip`, { type: "application/zip" });
    setUploads((prev) => [...prev, zippedFile]);
  };

  const removeUpload = (index: number) => {
    setUploads((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async () => {
    if (!selectedPipeline) return;
    if (selectedPipeline.requiresArchive && uploads.length === 0) {
      setUploadError("이 파이프라인은 최소 한 개의 파일이 필요합니다.");
      return;
    }
    setUploadError(null);
    setIsSubmitting(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("pipeline", selectedPipeline.key);
      form.append("notes", notes);
      form.append("preferred_download_dir", downloadDir);
      form.append("parameters", JSON.stringify(paramState));
      if (selectedPipeline.supportsSequence && sequence.trim()) {
        form.append("sequence", sequence.trim());
      }
      uploads.forEach((file) => form.append("files", file));
      await createJob(form, token);
      setUploads([]);
      setSequence("");
      setNotes("");
      await refreshJobs();
    } catch (error: any) {
      setUploadError(error.message || "작업 생성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async (jobId: string) => {
    const blob = await downloadArchive(jobId, token);
    triggerDownload(blob, `${jobId}.tar.gz`);
  };

  const handleArtifactDownload = async (jobId: string, artifactId: string, filename: string) => {
    const blob = await downloadArtifact(jobId, artifactId, token);
    triggerDownload(blob, filename);
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    await deleteJob(jobId, token);
    if (jobId === selectedJobId) {
      setSelectedJobId(null);
    }
    await refreshJobs();
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm text-slate-500">NAVER Server · RunPod Serverless</p>
            <h1 className="text-2xl font-semibold text-slate-900">멀티 파이프라인 제어 패널</h1>
          </div>
          <button className="rounded-full border border-slate-200 px-5 py-2 text-sm text-slate-600 hover:bg-slate-100" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-6">
        <div className="rounded-2xl border border-brand-100 bg-white p-6 text-sm text-slate-600 shadow-sm">
          <p>
            ?? 업로드한 데이터와 결과물은 서버 용량을 보호하기 위해 <strong>{retentionDays}일</strong> 뒤 자동으로 삭제됩니다. 중요한 결과는 즉시 다운로드 경로를 지정하거나 외부 스토리지에 백업하세요.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="grid gap-8 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-8">
            <PipelineSelector selected={selectedPipeline?.key} pipelines={pipelines} onSelect={setSelectedPipelineKey} />
            {selectedPipeline && (
              <SubmissionPanel
                pipeline={selectedPipeline}
                title={title}
                onTitleChange={setTitle}
                notes={notes}
                onNotesChange={setNotes}
                sequence={sequence}
                onSequenceChange={setSequence}
                downloadDir={downloadDir}
                onDownloadDirChange={setDownloadDir}
                paramState={paramState}
                onParamChange={handleParamChange}
                uploads={uploads}
                onFiles={handleFiles}
                onFolder={handleFolder}
                onRemove={removeUpload}
                onSubmit={handleSubmit}
                submitting={isSubmitting}
                uploadError={uploadError}
              />
            )}
          </div>
          <div className="space-y-6">
            <JobTable
              jobs={jobs}
              loading={jobsLoading}
              onSelect={setSelectedJobId}
              selectedJobId={selectedJob?.id}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
            {selectedJob && (
              <ResultPanel job={selectedJob} token={token} onArtifactDownload={handleArtifactDownload} />)
            }
          </div>
        </div>
      </section>
    </main>
  );
}

type PipelineSelectorProps = {
  pipelines: PipelineMeta[];
  selected?: string;
  onSelect: (key: string) => void;
};

function PipelineSelector({ pipelines, selected, onSelect }: PipelineSelectorProps) {
  const copyMap: Record<string, { description: string; instructions: string }> = {
    alphafold: {
      description: "??? ?? ??? ?? ??",
      instructions: "FASTA, ?? ???, ?? ZIP? ?????.",
    },
    diffdock: {
      description: "?? ???-??? ??",
      instructions: "PDB/SDF ?? ??? ? ?? ??????.",
    },
    phastest: {
      description: "?? ?? ??? ???",
      instructions: "Jupyter?? ??? CSV/HTML/FASTA? ??? ?????.",
    },
  };
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">파이프라인 선택</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {pipelines.map((pipeline) => (
          <button
            key={pipeline.key}
            onClick={() => onSelect(pipeline.key)}
            className={`rounded-2xl border p-4 text-left transition ${
              selected === pipeline.key ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white hover:border-brand-200"
            }`}
          >
            <p className="text-sm font-semibold text-brand-600">{pipeline.label}</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{copyMap[pipeline.key]?.description || pipeline.description}</p>
            <p className="mt-2 text-sm text-slate-500">{copyMap[pipeline.key]?.instructions || pipeline.instructions}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

type SubmissionPanelProps = {
  pipeline: PipelineMeta;
  title: string;
  onTitleChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  sequence: string;
  onSequenceChange: (value: string) => void;
  downloadDir: string;
  onDownloadDirChange: (value: string) => void;
  paramState: Record<string, string>;
  onParamChange: (name: string, value: string) => void;
  uploads: File[];
  onFiles: (files: FileList | null) => void;
  onFolder: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  uploadError: string | null;
};

function SubmissionPanel(props: SubmissionPanelProps) {
  const {
    pipeline,
    title,
    onTitleChange,
    notes,
    onNotesChange,
    sequence,
    onSequenceChange,
    downloadDir,
    onDownloadDirChange,
    paramState,
    onParamChange,
    uploads,
    onFiles,
    onFolder,
    onRemove,
    onSubmit,
    submitting,
    uploadError,
  } = props;

  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "true");
    }
  }, []);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-slate-900">{pipeline.label} 작업 세팅</h3>
          <p className="text-sm text-slate-500">모든 입력을 확인한 뒤 "작업 실행" 버튼을 누르세요.</p>
        </div>
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">{pipeline.previewKind.toUpperCase()}</span>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-slate-600">작업 제목</label>
          <input className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3" value={title} onChange={(e) => onTitleChange(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-600">결과 저장 경로</label>
          <input
            className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
            value={downloadDir}
            onChange={(e) => onDownloadDirChange(e.target.value)}
            placeholder="/data/results/user"
          />
        </div>
      </div>
      <div className="mt-4">
        <label className="text-sm font-semibold text-slate-600">설명 / 메모</label>
        <textarea
          className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="동일한 파라미터를 기록해 두면 재현성이 좋아집니다."
        />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {pipeline.inputFields.map((field) => (
          <div key={field.name}>
            <label className="text-sm font-semibold text-slate-600">{translate(field.label)}</label>
            {field.field_type === "select" ? (
              <select
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                value={paramState[field.name] || ""}
                onChange={(e) => onParamChange(field.name, e.target.value)}
              >
                <option value="" disabled>
                  옵션 선택
                </option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {translate(option.label)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3"
                placeholder={field.placeholder || ""}
                value={paramState[field.name] || ""}
                onChange={(e) => onParamChange(field.name, e.target.value)}
                required={field.required}
              />
            )}
            {field.helper && <p className="mt-1 text-xs text-slate-500">{translate(field.helper)}</p>}
          </div>
        ))}
      </div>
      {pipeline.supportsSequence && (
        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-600">서열 입력 (선택)</label>
          <textarea
            className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono"
            rows={4}
            value={sequence}
            onChange={(e) => onSequenceChange(e.target.value)}
            placeholder=">sp|/P12345 예시\nMVTES..."
          />
        </div>
      )}
      <div className="mt-6 rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 p-4">
        <p className="text-sm font-semibold text-slate-700">입력 데이터</p>
        <p className="text-xs text-slate-500">
          폴더 업로드 버튼은 브라우저에서 즉시 ZIP으로 압축하여 올려줍니다. 대용량 데이터는 미리 ZIP으로 만들어 두면 더 빠르게 전송됩니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm">
            파일 선택
            <input type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm">
            폴더 업로드
            <input type="file" className="hidden" multiple ref={folderInputRef} onChange={(e) => onFolder(e.target.files)} />
          </label>
        </div>
        {uploads.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {uploads.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                <span className="truncate">{file.name}</span>
                <button className="text-xs text-rose-500" onClick={() => onRemove(index)}>
                  제거
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">업로드된 파일이 없습니다.</p>
        )}
        {uploadError && <p className="mt-2 text-sm text-rose-500">{uploadError}</p>}
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-2xl bg-slate-900 px-6 py-3 text-white shadow-lg shadow-slate-300 transition hover:bg-brand-700 disabled:opacity-40"
        >
          {submitting ? "실행 중..." : "작업 실행"}
        </button>
      </div>
    </div>
  );
}

type JobTableProps = {
  jobs?: JobResponse[];
  loading: boolean;
  selectedJobId?: string;
  onSelect: (id: string) => void;
  onDownload: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function JobTable({ jobs, loading, selectedJobId, onSelect, onDownload, onDelete }: JobTableProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">내 작업</h3>
        <span className="text-sm text-slate-500">{jobs?.length || 0}건</span>
      </div>
      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-slate-500">작업 목록을 불러오는 중...</p>}
        {!loading && (!jobs || jobs.length === 0) && <p className="text-sm text-slate-400">아직 실행한 작업이 없습니다.</p>}
        {jobs?.map((job) => (
          <div
            key={job.id}
            className={`rounded-2xl border p-3 ${selectedJobId === job.id ? "border-brand-400 bg-brand-50" : "border-slate-100 bg-white"}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{job.title}</p>
                <p className="text-xs text-slate-500">{job.pipeline.toUpperCase()} · {new Date(job.created_at).toLocaleString("ko-KR")}</p>
              </div>
              <JobStatusBadge status={job.status} />
            </div>
            <div className="mt-3 flex gap-2 text-xs text-slate-500">
              <button className="rounded-full border border-slate-200 px-3 py-1" onClick={() => onSelect(job.id)}>
                상세보기
              </button>
              <button className="rounded-full border border-slate-200 px-3 py-1" onClick={() => void onDownload(job.id)}>
                결과 다운로드
              </button>
              <button className="rounded-full border border-rose-200 px-3 py-1 text-rose-500" onClick={() => void onDelete(job.id)}>
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ResultPanelProps = {
  job: JobResponse;
  token: string;
  onArtifactDownload: (jobId: string, artifactId: string, filename: string) => Promise<void>;
};

function ResultPanel({ job, token, onArtifactDownload }: ResultPanelProps) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string[] = [];
    async function prepare() {
      setViewerUrl(null);
      setHtmlPreviewUrl(null);
      const structure = job.artifacts.find((artifact) => artifact.file_name.endsWith(".pdb"));
      if (structure) {
        const blob = await downloadArtifact(job.id, structure.id, token);
        const url = URL.createObjectURL(blob);
        setViewerUrl(url);
        revoked.push(url);
      }
      const html = job.artifacts.find((artifact) => artifact.file_name.endsWith(".html"));
      if (html) {
        const blob = await downloadArtifact(job.id, html.id, token);
        const url = URL.createObjectURL(blob);
        setHtmlPreviewUrl(url);
        revoked.push(url);
      }
    }
    prepare();
    return () => {
      revoked.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [job.id, job.artifacts, token]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">결과 패널</h3>
      <p className="text-sm text-slate-500">선택한 작업: {job.title}</p>
      {job.pipeline === "alphafold" && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600">3D Protein Viewer</p>
          {viewerUrl ? <NglViewer url={viewerUrl} /> : <p className="text-xs text-slate-400">구조 파일을 준비하는 중입니다.</p>}
        </div>
      )}
      {job.pipeline === "phastest" && htmlPreviewUrl && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600">PHASTEST 리포트</p>
          <iframe src={htmlPreviewUrl} className="h-80 w-full rounded-xl border border-slate-200" title="PHASTEST" />
        </div>
      )}
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-700">아티팩트</p>
        <div className="mt-2 space-y-2">
          {job.artifacts.map((artifact) => (
            <div key={artifact.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm text-slate-600">
              <div>
                <p className="font-semibold text-slate-800">{artifact.file_name}</p>
                <p className="text-xs text-slate-400">{(artifact.size_bytes / 1024).toFixed(1)} KB</p>
              </div>
              <button className="text-xs text-brand-600" onClick={() => onArtifactDownload(job.id, artifact.id, artifact.file_name)}>
                다운로드
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function translate(text?: string) {
  const dictionary: Record<string, string> = {
    "Model preset": "모델 프리셋",
    "DB preset": "DB 프리셋",
    "Max template date": "최대 템플릿 날짜",
    "Sample count": "샘플 개수",
    "Random seed": "랜덤 시드",
    "Report language": "리포트 언어",
    Full: "Full",
    Reduced: "Reduced",
    Monomer: "Monomer",
    Multimer: "Multimer",
    English: "English",
    Korean: "한국어",
  };
  return text ? dictionary[text] || text : "";
}



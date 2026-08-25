import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { 
  ArrowLeft, 
  Code, 
  Send, 
  Sparkles, 
  RefreshCw, 
  Check, 
  Copy, 
  Terminal, 
  ShieldCheck, 
  AlertCircle, 
  Cpu, 
  Database, 
  Mail, 
  Clock, 
  Zap, 
  CheckCircle2, 
  ExternalLink 
} from 'lucide-react';
import { isS3Configured, uploadToS3 } from '../services/s3Service';
import { sendInterviewInvitations } from '../services/brevoService';

import {
  callBedrockApi,
  getBedrockApiKey,
  BEDROCK_MODELS,
} from '../services/bedrockService';

export default function AdminApiTester() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  // Active Tab
  const [activeApiTab, setActiveApiTab] = useState<'bedrock' | 's3' | 'brevo' | 'env'>('bedrock');

  // Amazon Bedrock Mantle Test State
  const [bedrockApiKey, setBedrockApiKey] = useState<string>(() => {
    try {
      return getBedrockApiKey();
    } catch {
      return '';
    }
  });
  const [selectedModel, setSelectedModel] = useState<string>(BEDROCK_MODELS.default);
  const [testPrompt, setTestPrompt] = useState<string>(
    'Explain how AI works in a few words'
  );
  const [temperature, setTemperature] = useState<number>(0.2);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLatencyMs, setAiLatencyMs] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);

  // S3 Upload Test State
  const [s3TestFile, setS3TestFile] = useState<File | null>(null);
  const [isS3Loading, setIsS3Loading] = useState<boolean>(false);
  const [s3ResultUrl, setS3ResultUrl] = useState<string | null>(null);
  const [s3Error, setS3Error] = useState<string | null>(null);

  // Brevo Test State
  const [emailRecipient, setEmailRecipient] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('Test Email from InterviewXpert API Tester');
  const [emailBody, setEmailBody] = useState<string>('This is a test message to verify Brevo API integration on InterviewXpert.');
  const [isEmailLoading, setIsEmailLoading] = useState<boolean>(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Run Amazon Bedrock Mantle API Test
  const handleTestBedrock = async () => {
    const cleanKey = bedrockApiKey.replace(/['"]/g, '').trim();
    if (!cleanKey) {
      setAiError('Bedrock API key missing. Set VITE_ANTHROPIC_API_KEY in .env.');
      return;
    }

    setIsAiLoading(true);
    setAiError(null);
    setAiResponse(null);
    const start = performance.now();

    try {
      const reply = await callBedrockApi(
        '',
        testPrompt,
        temperature,
        false,
        'default',
        1024,
        selectedModel
      );
      const latency = Math.round(performance.now() - start);
      setAiLatencyMs(latency);
      setAiResponse(reply);
    } catch (err: any) {
      console.error('Bedrock API Test Error:', err);
      setAiError(err.message || 'Failed to call Amazon Bedrock Mantle.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Run S3 Test
  const handleTestS3 = async () => {
    if (!s3TestFile) return;
    setIsS3Loading(true);
    setS3Error(null);
    setS3ResultUrl(null);

    try {
      const url = await uploadToS3(s3TestFile, 'auto', s3TestFile.name);
      setS3ResultUrl(url);
    } catch (err: any) {
      console.error("S3 Test Error:", err);
      setS3Error(err.message || "Failed to upload to S3. Verify AWS keys & CORS settings.");
    } finally {
      setIsS3Loading(false);
    }
  };

  // Run Amazon SES Test
  const handleTestBrevo = async () => {
    if (!emailRecipient) {
      setEmailError("Recipient email address is required.");
      return;
    }
    setIsEmailLoading(true);
    setEmailError(null);
    setEmailResult(null);

    try {
      const res = await sendInterviewInvitations(
        [emailRecipient],
        emailSubject,
        'https://interviewxpert.in',
        'TEST-CODE'
      );
      if (res.success) {
        setEmailResult(`Test email sent successfully to ${emailRecipient} via Amazon SES`);
      } else {
        throw new Error(res.error || 'Failed to send email via Amazon SES');
      }
    } catch (err: any) {
      console.error("Amazon SES Test Error:", err);
      setEmailError(err.message || "Failed to send email via Amazon SES.");
    } finally {
      setIsEmailLoading(false);
    }
  };

  // Generate Curl Command
  const generateCurlCommand = () => {
    return `curl https://openrouter.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer ${openRouterApiKey || 'YOUR_OPENROUTER_API_KEY'}" \\
  -H "HTTP-Referer: https://interviewxpert.in" \\
  -H "X-Title: InterviewXpert" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    model: selectedModel,
    messages: [{ role: "user", content: testPrompt }],
    temperature: temperature
  }, null, 2)}'`;
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0a0a0a] text-white' : 'bg-gray-50 text-gray-900'} transition-colors duration-200`}>
      
      {/* Top Header */}
      <div className={`border-b ${isDark ? 'border-white/10 bg-[#111]' : 'border-gray-200 bg-white'} px-6 py-4 sticky top-0 z-40`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/admin')}
              className={`p-2 rounded-xl border transition-colors ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-100'}`}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black flex items-center gap-2 tracking-tight">
                <Code size={24} className="text-blue-500" />
                API Testing & Sandbox Playground
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Test OpenRouter AI, Amazon S3 Storage, and Brevo Email endpoints live in real time.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-full text-xs font-bold flex items-center gap-1.5">
              <Zap size={14} /> Live Sandbox Active
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-white/10 gap-2 overflow-x-auto custom-scrollbar pb-1">
          <button
            onClick={() => setActiveApiTab('bedrock')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeApiTab === 'bedrock' ? 'bg-blue-600 text-white shadow-md' : isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
          >
            <Sparkles size={16} /> AWS Bedrock Mantle (Chat Completions)
          </button>
          <button
            onClick={() => setActiveApiTab('s3')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeApiTab === 's3' ? 'bg-blue-600 text-white shadow-md' : isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
          >
            <Database size={16} /> Amazon S3 Upload Tester
          </button>
          <button
            onClick={() => setActiveApiTab('brevo')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeApiTab === 'brevo' ? 'bg-blue-600 text-white shadow-md' : isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
          >
            <Mail size={16} /> Amazon SES Email Tester
          </button>
          <button
            onClick={() => setActiveApiTab('env')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeApiTab === 'env' ? 'bg-blue-600 text-white shadow-md' : isDark ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
          >
            <ShieldCheck size={16} /> Key Diagnostics
          </button>
        </div>

        {/* Tab 1: AWS Bedrock Mantle Playground */}
        {activeApiTab === 'bedrock' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Left Column: Request Form */}
            <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm space-y-4`}>
              <h2 className="text-base font-bold flex items-center gap-2">
                <Sparkles size={18} className="text-blue-500" />
                Configure Bedrock Mantle Request (ap-south-1)
              </h2>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Bedrock API Key (VITE_ANTHROPIC_API_KEY)</label>
                <input 
                  type="password" 
                  value={bedrockApiKey}
                  onChange={e => setBedrockApiKey(e.target.value)}
                  placeholder="ABSK..."
                  className={`w-full p-2.5 rounded-xl border text-xs font-mono outline-none ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Select Bedrock Model</label>
                
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedModel(BEDROCK_MODELS.questions)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${selectedModel === BEDROCK_MODELS.questions ? 'bg-blue-600 text-white border-blue-700 shadow' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20'}`}
                  >
                    MiniMax M2.1 (questions)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModel(BEDROCK_MODELS.report)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${selectedModel === BEDROCK_MODELS.report ? 'bg-purple-600 text-white border-purple-700 shadow' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 hover:bg-purple-500/20'}`}
                  >
                    MiniMax M2.5 (report)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedModel(BEDROCK_MODELS.default)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${selectedModel === BEDROCK_MODELS.default ? 'bg-emerald-600 text-white border-emerald-700 shadow' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'}`}
                  >
                    GLM 4.7 Flash (default)
                  </button>
                </div>

                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-bold outline-none cursor-pointer ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                >
                  <option value={BEDROCK_MODELS.questions}>{BEDROCK_MODELS.questions} — Interview questions</option>
                  <option value={BEDROCK_MODELS.report}>{BEDROCK_MODELS.report} — Report generation</option>
                  <option value={BEDROCK_MODELS.default}>{BEDROCK_MODELS.default} — All other AI tasks</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-gray-500">Temperature: {temperature}</label>
                  <span className="text-[10px] text-gray-400">0 = Precise, 1 = Creative</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={temperature}
                  onChange={e => setTemperature(parseFloat(e.target.value))}
                  className="w-full cursor-pointer accent-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Prompt / Input Text</label>
                <textarea
                  rows={4}
                  value={testPrompt}
                  onChange={e => setTestPrompt(e.target.value)}
                  placeholder="Explain how AI works in a few words"
                  className={`w-full p-3 rounded-xl border text-xs outline-none transition-all ${isDark ? 'bg-black border-white/10 text-white focus:border-blue-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'}`}
                />
              </div>

              <button
                onClick={handleTestBedrock}
                disabled={isAiLoading || !testPrompt.trim()}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Calling Bedrock Mantle...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Test Bedrock Mantle API
                  </>
                )}
              </button>
            </div>

            {/* Right Column: Output & Response Panel */}
            <div className="space-y-6">
              
              <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm space-y-3`}>
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Terminal size={18} className="text-emerald-500" />
                    Bedrock Mantle Response
                  </h3>

                  {aiLatencyMs !== null && (
                    <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                      <Clock size={12} /> {aiLatencyMs} ms
                    </span>
                  )}
                </div>

                {isAiLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
                    <p className="text-xs text-gray-500 font-bold">Waiting for Bedrock response...</p>
                  </div>
                ) : aiError ? (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-xs font-medium space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertCircle size={16} /> API Error Occurred:
                    </div>
                    <p className="font-mono break-all">{aiError}</p>
                  </div>
                ) : aiResponse ? (
                  <div className="space-y-3 animate-fade-in">
                    <div className="p-4 bg-slate-900 text-emerald-400 rounded-xl font-mono text-xs leading-relaxed whitespace-pre-wrap border border-slate-800 relative group max-h-80 overflow-y-auto custom-scrollbar">
                      {aiResponse}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(aiResponse);
                          setCopiedResponse(true);
                          setTimeout(() => setCopiedResponse(false), 2000);
                        }}
                        className="absolute top-2 right-2 px-2 py-1 bg-slate-800 text-white rounded text-[10px] font-bold hover:bg-slate-700 transition-colors flex items-center gap-1"
                      >
                        {copiedResponse ? <Check size={12} /> : <Copy size={12} />}
                        {copiedResponse ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-gray-400 font-medium">
                    Click "Test Bedrock Mantle API" to verify MiniMax / GLM models.
                  </div>
                )}
              </div>

              <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm space-y-2`}>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Code size={14} /> openai SDK → Bedrock Mantle /v1 (MiniMax / GLM)
                </h4>
                <div className="p-3 bg-black text-gray-300 rounded-xl font-mono text-[11px] overflow-x-auto custom-scrollbar border border-white/10">
                  <pre>{`import OpenAI from "openai";

// MiniMax + GLM require Chat Completions (not Anthropic Messages).
const client = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY, // Bedrock Mantle ABSK key
  baseURL: "https://bedrock-mantle.ap-south-1.api.aws/v1",
});

const msg = await client.chat.completions.create({
  model: "${selectedModel}",
  max_tokens: 1024,
  messages: [{ role: "user", content: "${testPrompt.replace(/"/g, '\\"')}" }],
});
console.log(msg.choices[0].message.content);`}</pre>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Tab 2: Amazon S3 Upload Tester */}
        {activeApiTab === 's3' && (
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm space-y-4 max-w-2xl mx-auto`}>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Database size={20} className="text-blue-500" />
              Amazon S3 Direct Upload Tester
            </h2>
            <p className="text-xs text-gray-500">Test uploading files directly to your configured AWS S3 bucket and verify generated public URLs.</p>

            <div className="space-y-3 pt-2">
              <input 
                type="file" 
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    setS3TestFile(e.target.files[0]);
                    setS3ResultUrl(null);
                    setS3Error(null);
                  }
                }}
                className={`w-full p-2.5 border rounded-xl text-xs outline-none ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
              />

              <button
                onClick={handleTestS3}
                disabled={!s3TestFile || isS3Loading}
                className="w-full py-3 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isS3Loading ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                {isS3Loading ? 'Uploading to S3...' : 'Upload & Test S3 Public Link'}
              </button>

              {s3Error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-xs font-mono">
                  {s3Error}
                </div>
              )}

              {s3ResultUrl && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-1"><CheckCircle2 size={16} /> Uploaded Successfully</span>
                    <a href={s3ResultUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                      Open Link <ExternalLink size={12} />
                    </a>
                  </div>
                  <input type="text" readOnly value={s3ResultUrl} className="w-full p-2 bg-white dark:bg-black border border-emerald-500/20 rounded-lg text-xs font-mono outline-none text-gray-800 dark:text-gray-200" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Brevo Email Tester */}
        {activeApiTab === 'brevo' && (
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm space-y-4 max-w-2xl mx-auto`}>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Mail size={20} className="text-blue-500" />
              Brevo Transactional Email Tester
            </h2>
            <p className="text-xs text-gray-500">Send a test email notification to verify Brevo API key and sender address integration.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Recipient Email Address</label>
                <input 
                  type="email" 
                  value={emailRecipient} 
                  onChange={e => setEmailRecipient(e.target.value)} 
                  placeholder="e.g. admin@interviewxpert.in"
                  className={`w-full p-2.5 rounded-xl border text-xs outline-none ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Email Subject</label>
                <input 
                  type="text" 
                  value={emailSubject} 
                  onChange={e => setEmailSubject(e.target.value)} 
                  className={`w-full p-2.5 rounded-xl border text-xs outline-none ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Email Message Content</label>
                <textarea 
                  rows={3}
                  value={emailBody} 
                  onChange={e => setEmailBody(e.target.value)} 
                  className={`w-full p-2.5 rounded-xl border text-xs outline-none ${isDark ? 'bg-black border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'}`}
                />
              </div>

              <button
                onClick={handleTestBrevo}
                disabled={isEmailLoading || !emailRecipient}
                className="w-full py-3 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isEmailLoading ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                {isEmailLoading ? 'Sending Email...' : 'Send Test Email via Brevo'}
              </button>

              {emailError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-xs font-mono">
                  {emailError}
                </div>
              )}

              {emailResult && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} /> {emailResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Key Diagnostics */}
        {activeApiTab === 'env' && (
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#111] border-white/10' : 'bg-white border-gray-200'} shadow-sm space-y-4 max-w-3xl mx-auto`}>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck size={20} className="text-emerald-500" />
              Environment & API Key Diagnostics
            </h2>

            <div className="space-y-3">
              {[
                { name: 'VITE_ANTHROPIC_API_KEY', val: import.meta.env.VITE_ANTHROPIC_API_KEY },
                { name: 'VITE_ANTHROPIC_BASE_URL', val: import.meta.env.VITE_ANTHROPIC_BASE_URL },
                { name: 'VITE_BEDROCK_CHAT_BASE_URL', val: import.meta.env.VITE_BEDROCK_CHAT_BASE_URL },
                { name: 'VITE_ANTHROPIC_WORKSPACE_ID', val: import.meta.env.VITE_ANTHROPIC_WORKSPACE_ID },
                { name: 'VITE_BEDROCK_MODEL_QUESTIONS', val: import.meta.env.VITE_BEDROCK_MODEL_QUESTIONS },
                { name: 'VITE_BEDROCK_MODEL_REPORT', val: import.meta.env.VITE_BEDROCK_MODEL_REPORT },
                { name: 'VITE_BEDROCK_MODEL_DEFAULT', val: import.meta.env.VITE_BEDROCK_MODEL_DEFAULT },
                { name: 'VITE_AWS_S3_BUCKET_NAME', val: import.meta.env.VITE_AWS_S3_BUCKET_NAME },
                { name: 'VITE_AWS_S3_REGION', val: import.meta.env.VITE_AWS_S3_REGION },
                { name: 'VITE_BREVO_API_KEY', val: import.meta.env.VITE_BREVO_API_KEY },
                { name: 'VITE_ASSEMBLYAI_API_KEY', val: import.meta.env.VITE_ASSEMBLYAI_API_KEY },
                { name: 'VITE_SARVAM_API_KEY', val: import.meta.env.VITE_SARVAM_API_KEY }
              ].map(item => (
                <div key={item.name} className="p-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{item.name}</span>
                    <p className="font-mono text-gray-400 text-[11px] mt-0.5">
                      {item.val ? (item.name.includes('KEY') ? item.val.slice(0, 8) + '...' + item.val.slice(-4) : item.val) : 'Not configured'}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${item.val ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30' : 'bg-red-500/10 text-red-600 border border-red-500/30'}`}>
                    {item.val ? 'Set' : 'Missing'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

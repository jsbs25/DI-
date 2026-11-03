import React, { useEffect, useState } from 'react';
import {
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  ShieldCheck,
  BookOpen,
  Save,
  Plus
} from 'lucide-react';
import { Book, BookCategory } from '../../types/index.ts';

interface AdminLibraryProps {
  onBack: () => void;
}

const CATEGORY_OPTIONS: { value: BookCategory; label: string }[] = [
  { value: 'literature', label: '文学与艺术' },
  { value: 'history', label: '历史与文明' },
  { value: 'philosophy', label: '哲学与思想' },
  { value: 'science', label: '科学与技术' },
  { value: 'religion', label: '宗教与文化' },
  { value: 'islamic_studies', label: '阿拉伯语文献' },
  { value: 'education', label: '教育与语言' },
  { value: 'computer_science', label: '计算与 AI' },
  { value: 'economics', label: '经济学' },
  { value: 'social_sciences', label: '社会科学' },
  { value: 'geography', label: '地理' },
  { value: 'languages', label: '语言' },
  { value: 'ai', label: '人工智能' }
];

/**
 * Admin library management panel: edit metadata, delete books, and manage
 * the collection. Accessible from the WORLD LIBRARY navigation.
 */
export const AdminLibrary: React.FC<AdminLibraryProps> = ({ onBack }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<Book | null>(null);
  const [editForm, setEditForm] = useState<Partial<Book>>({});
  const [message, setMessage] = useState<string | null>(null);

  const loadBooks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/library/books');
      const data = await res.json();
      if (data.success) setBooks(data.books);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  const filtered = books.filter(
    b => b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (book: Book) => {
    setEditing(book);
    setEditForm({
      title: book.title,
      author: book.author,
      category: book.category,
      language: book.language,
      year: book.year,
      publisher: book.publisher,
      isbn: book.isbn,
      description: book.description,
      coverImage: book.coverImage,
      copyrightStatus: book.copyrightStatus,
      source: book.source
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/library/books/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (data.success) {
        setBooks(prev => prev.map(b => (b.id === editing.id ? data.book : b)));
        setEditing(null);
        setMessage('已保存');
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteBook = async (book: Book) => {
    if (!confirm(`确定删除《${book.title}》？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/library/books/${book.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setBooks(prev => prev.filter(b => b.id !== book.id));
        setMessage('已删除');
        setTimeout(() => setMessage(null), 2000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <button onClick={onBack} className="text-xs text-slate-400 hover:text-white cursor-pointer">← 返回</button>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">图书管理后台</h2>
          </div>
        </div>
        {message && <span className="text-xs text-emerald-400">{message}</span>}
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索书名或作者..."
          className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Book list */}
      {isLoading ? (
        <div className="text-center text-slate-500 py-12">加载中...</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(book => (
            <div key={book.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all">
              {book.coverImage && (
                <img src={book.coverImage} alt={book.title} className="w-10 h-14 object-cover rounded-md shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white line-clamp-1">{book.title}</h4>
                <p className="text-[11px] text-slate-400 line-clamp-1">
                  {book.author} · {book.language?.toUpperCase()} · {book.source}
                  {book.formatType ? ` · ${book.formatType.toUpperCase()}` : ''}
                </p>
              </div>
              <div className="flex items-center space-x-1 shrink-0">
                <button onClick={() => startEdit(book)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer" title="编辑">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteBook(book)} className="p-2 rounded-lg bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-300 cursor-pointer" title="删除">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-xs">暂无图书</p>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0a1128] border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-emerald-400" />
                <span>编辑图书元数据</span>
              </h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="书名" value={editForm.title} onChange={v => setEditForm({ ...editForm, title: v })} />
              <Field label="作者" value={editForm.author} onChange={v => setEditForm({ ...editForm, author: v })} />
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">分类</label>
                <select
                  value={editForm.category}
                  onChange={e => setEditForm({ ...editForm, category: e.target.value as BookCategory })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <Field label="语言" value={editForm.language} onChange={v => setEditForm({ ...editForm, language: v })} />
              <Field label="出版年份" value={editForm.year} onChange={v => setEditForm({ ...editForm, year: v })} />
              <Field label="出版社" value={editForm.publisher} onChange={v => setEditForm({ ...editForm, publisher: v })} />
              <Field label="ISBN" value={editForm.isbn} onChange={v => setEditForm({ ...editForm, isbn: v })} />
              <Field label="封面 URL" value={editForm.coverImage} onChange={v => setEditForm({ ...editForm, coverImage: v })} />
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">版权状态</label>
                <select
                  value={editForm.copyrightStatus || 'public_domain'}
                  onChange={e => setEditForm({ ...editForm, copyrightStatus: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="public_domain">公共领域</option>
                  <option value="open_access">开放获取</option>
                  <option value="licensed">授权许可</option>
                  <option value="copyrighted">受版权保护</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">资源来源</label>
                <select
                  value={editForm.source}
                  onChange={e => setEditForm({ ...editForm, source: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Project Gutenberg">Project Gutenberg</option>
                  <option value="Internet Archive">Internet Archive</option>
                  <option value="Open Library">Open Library</option>
                  <option value="Open Access">Open Access</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-[11px] text-slate-400 mb-1">内容简介</label>
              <textarea
                rows={3}
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="mt-6 flex items-center justify-end space-x-3">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer">
                取消
              </button>
              <button onClick={saveEdit} className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer">
                <Save className="w-3.5 h-3.5" />
                <span>保存</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function Field({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
      />
    </div>
  );
}

import React, { useState } from 'react';
import { soundSynth } from './soundSynth.ts';
import {
  Compass,
  MapPin,
  Trophy,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Globe2
} from 'lucide-react';

interface Landmark {
  id: string;
  name: string;
  chineseName: string;
  country: string;
  chineseCountry: string;
  continent: string;
  image: string;
  coordinates: { lat: number; lng: number };
  clues: string[];
  options: { name: string; country: string }[];
  correctOptionIndex: number;
  fact: string;
}

const LANDMARKS: Landmark[] = [
  {
    id: 'great-wall',
    name: 'The Great Wall',
    chineseName: '万里长城',
    country: 'China',
    chineseCountry: '中国',
    continent: 'Asia',
    image: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1000&q=80',
    coordinates: { lat: 40.4319, lng: 116.5704 },
    clues: [
      'Built across historical northern borders over two millennia.',
      'Constructed with brick, tamped earth, stone, and wood.',
      'Measures over 21,196 kilometers in total defensive length.'
    ],
    options: [
      { name: 'The Great Wall', country: 'China' },
      { name: 'Hadrian\'s Wall', country: 'United Kingdom' },
      { name: 'Kumbalgarh Fort Wall', country: 'India' },
      { name: 'Antonine Wall', country: 'Scotland' }
    ],
    correctOptionIndex: 0,
    fact: 'The mortar used in the Ming dynasty sections included sticky rice flour, giving it incredible longevity and earthquake resistance.'
  },
  {
    id: 'pyramids',
    name: 'Great Pyramid of Giza',
    chineseName: '吉萨大金字塔',
    country: 'Egypt',
    chineseCountry: '埃及',
    continent: 'Africa',
    image: 'https://images.unsplash.com/photo-1503177119275-0aa32b3a9368?auto=format&fit=crop&w=1000&q=80',
    coordinates: { lat: 29.9792, lng: 31.1342 },
    clues: [
      'The oldest of the Seven Wonders of the Ancient World, and the only one largely intact.',
      'Built for Pharaoh Khufu circa 2560 BC.',
      'Aligned true north with an accuracy of within 4 minutes of arc.'
    ],
    options: [
      { name: 'Ziggurat of Ur', country: 'Iraq' },
      { name: 'Pyramid of the Sun', country: 'Mexico' },
      { name: 'Great Pyramid of Giza', country: 'Egypt' },
      { name: 'Nubian Pyramids', country: 'Sudan' }
    ],
    correctOptionIndex: 2,
    fact: 'For over 3,800 years, the Great Pyramid was the tallest human-built structure on Earth.'
  },
  {
    id: 'taj-mahal',
    name: 'Taj Mahal',
    chineseName: '泰姬陵',
    country: 'India',
    chineseCountry: '印度',
    continent: 'Asia',
    image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1000&q=80',
    coordinates: { lat: 27.1751, lng: 78.0421 },
    clues: [
      'An ivory-white marble mausoleum on the south bank of the Yamuna river.',
      'Commissioned in 1631 by Mughal Emperor Shah Jahan for his wife Mumtaz Mahal.',
      'Features elaborate pietra dura semi-precious stone inlays.'
    ],
    options: [
      { name: 'Sheikh Zayed Grand Mosque', country: 'United Arab Emirates' },
      { name: 'Taj Mahal', country: 'India' },
      { name: 'Humayun\'s Tomb', country: 'India' },
      { name: 'Badshahi Mosque', country: 'Pakistan' }
    ],
    correctOptionIndex: 1,
    fact: 'The four minarets were deliberately designed to lean slightly outward so that in the event of an earthquake, they would fall away from the central dome.'
  },
  {
    id: 'machu-picchu',
    name: 'Machu Picchu',
    chineseName: '马丘比丘',
    country: 'Peru',
    chineseCountry: '秘鲁',
    continent: 'South America',
    image: 'https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=1000&q=80',
    coordinates: { lat: -13.1631, lng: -72.545 },
    clues: [
      'A 15th-century Inca citadel situated on an Andes mountain ridge 2,430 meters above sea level.',
      'Constructed with ashlar polished dry-stone walls that fit without mortar.',
      'Often referred to as the Lost City of the Incas.'
    ],
    options: [
      { name: 'Tikal', country: 'Guatemala' },
      { name: 'Teotihuacan', country: 'Mexico' },
      { name: 'Machu Picchu', country: 'Peru' },
      { name: 'Tiwanaku', country: 'Bolivia' }
    ],
    correctOptionIndex: 2,
    fact: 'The masonry technique known as ashlar involves stones cut so precisely that not even a knife blade can fit between them.'
  },
  {
    id: 'colosseum',
    name: 'The Colosseum',
    chineseName: '罗马斗兽场',
    country: 'Italy',
    chineseCountry: '意大利',
    continent: 'Europe',
    image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1000&q=80',
    coordinates: { lat: 41.8902, lng: 12.4922 },
    clues: [
      'The largest ancient amphitheatre ever built, constructed in 70–80 AD.',
      'Could hold an estimated 50,000 to 80,000 spectators.',
      'Located just east of the Roman Forum.'
    ],
    options: [
      { name: 'Arena of Nîmes', country: 'France' },
      { name: 'The Colosseum', country: 'Italy' },
      { name: 'El Jem Amphitheatre', country: 'Tunisia' },
      { name: 'Verona Arena', country: 'Italy' }
    ],
    correctOptionIndex: 1,
    fact: 'The amphitheater had a massive retractable awning called the velarium, operated by Roman sailors, to shield spectators from rain and heat.'
  },
  {
    id: 'fuji',
    name: 'Mount Fuji',
    chineseName: '富士山',
    country: 'Japan',
    chineseCountry: '日本',
    continent: 'Asia',
    image: 'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=1000&q=80',
    coordinates: { lat: 35.3606, lng: 138.7274 },
    clues: [
      'An active stratovolcano standing at 3,776 meters.',
      'One of Japan\'s Three Holy Mountains (Sanreizan).',
      'An exceptionally symmetrical snow-capped volcanic cone.'
    ],
    options: [
      { name: 'Mount Fuji', country: 'Japan' },
      { name: 'Mount Rainier', country: 'United States' },
      { name: 'Mount Kilimanjaro', country: 'Tanzania' },
      { name: 'Mount Taranaki', country: 'New Zealand' }
    ],
    correctOptionIndex: 0,
    fact: 'Mount Fuji last erupted in December 1707 during the Edo period, spreading volcanic ash all the way to Edo (modern Tokyo).'
  }
];

export const GeoGuesserGame: React.FC<{ lang?: string; onFlyTo?: (coords: { lat: number; lng: number }) => void }> = ({
  lang = 'zh',
  onFlyTo
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedClues, setRevealedClues] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const currentLandmark = LANDMARKS[currentIndex];

  const handleSelectOption = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);

    const isCorrect = idx === currentLandmark.correctOptionIndex;
    if (isCorrect) {
      soundSynth.playVictory();
      const cluePenalty = revealedClues * 25;
      const roundScore = Math.max(50, 150 - cluePenalty) * (1 + streak * 0.2);
      setScore(s => s + Math.round(roundScore));
      setStreak(s => s + 1);
    } else {
      soundSynth.playExplosion();
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (currentIndex < LANDMARKS.length - 1) {
      setCurrentIndex(i => i + 1);
      setSelectedOption(null);
      setRevealedClues(0);
    } else {
      setQuizFinished(true);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setRevealedClues(0);
    setScore(0);
    setStreak(0);
    setQuizFinished(false);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-cyan-400 font-mono font-bold">
            <Compass className="w-4 h-4" />
            <span>PLANET GEOGUESSR</span>
          </div>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">
            Landmark {currentIndex + 1} of {LANDMARKS.length}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-amber-400 font-mono font-bold">
            <Trophy className="w-3.5 h-3.5" />
            <span>Score: {score}</span>
          </div>
          {streak > 1 && (
            <div className="px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono text-[10px] font-bold animate-pulse">
              {streak}x STREAK 🔥
            </div>
          )}
        </div>
      </div>

      {!quizFinished ? (
        <div className="rounded-3xl bg-slate-900/80 border border-slate-800 overflow-hidden shadow-2xl p-6 space-y-6">
          {/* Landmark Satellite / Photographic Viewport */}
          <div className="relative rounded-2xl overflow-hidden aspect-video bg-slate-950 border border-slate-800 shadow-inner group">
            <img
              src={currentLandmark.image}
              alt="Global Landmark"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

            <div className="absolute top-3 left-3 px-3 py-1 rounded-xl bg-slate-950/80 border border-slate-800 backdrop-blur-md text-[11px] font-mono text-cyan-400 flex items-center space-x-1.5">
              <MapPin className="w-3 h-3 text-cyan-400" />
              <span>
                Coordinates: {currentLandmark.coordinates.lat.toFixed(2)}°, {currentLandmark.coordinates.lng.toFixed(2)}°
              </span>
            </div>

            {selectedOption !== null && onFlyTo && (
              <button
                onClick={() => onFlyTo(currentLandmark.coordinates)}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <Globe2 className="w-3.5 h-3.5" />
                <span>Fly Here on 3D Earth</span>
              </button>
            )}

            <div className="absolute bottom-3 left-4 right-4">
              <div className="text-slate-300 text-xs">
                Continent: <span className="text-slate-100 font-bold">{currentLandmark.continent}</span>
              </div>
            </div>
          </div>

          {/* Clue Inspector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium flex items-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span>Planetary Intelligence Clues:</span>
              </span>
              {revealedClues < currentLandmark.clues.length && selectedOption === null && (
                <button
                  onClick={() => setRevealedClues(r => r + 1)}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  Reveal Hint (-25 pts)
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {currentLandmark.clues.slice(0, revealedClues).map((clue, idx) => (
                <div
                  key={idx}
                  className="px-3.5 py-2 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-200 text-xs animate-in fade-in"
                >
                  💡 Clue #{idx + 1}: {clue}
                </div>
              ))}
              {revealedClues === 0 && selectedOption === null && (
                <div className="text-[11px] text-slate-500 italic px-1">
                  Try identifying the monument without clues for maximum streak bonus!
                </div>
              )}
            </div>
          </div>

          {/* Interactive Multiple Choice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentLandmark.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === currentLandmark.correctOptionIndex;
              const hasAnswered = selectedOption !== null;

              let btnStyle = 'bg-slate-950/60 border-slate-800 text-slate-200 hover:border-slate-700 hover:bg-slate-900';
              if (hasAnswered) {
                if (isCorrect) btnStyle = 'bg-emerald-950/80 border-emerald-500 text-emerald-200';
                else if (isSelected) btnStyle = 'bg-rose-950/80 border-rose-500 text-rose-200';
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(idx)}
                  disabled={hasAnswered}
                  className={`p-3.5 rounded-2xl border text-left text-xs sm:text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${btnStyle}`}
                >
                  <div>
                    <div className="font-bold text-slate-100">{opt.name}</div>
                    <div className="text-[11px] text-slate-400">{opt.country}</div>
                  </div>
                  {hasAnswered && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                  {hasAnswered && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-400" />}
                </button>
              );
            })}
          </div>

          {/* Answer Educational Fact Card */}
          {selectedOption !== null && (
            <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-600/40 space-y-2 animate-in fade-in">
              <div className="flex items-center space-x-2 text-cyan-300 font-bold text-xs">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Geographic & Historical Intelligence:</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{currentLandmark.fact}</p>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleNext}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>{currentIndex < LANDMARKS.length - 1 ? 'Next Landmark' : 'View Expedition Results'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 text-center space-y-4 shadow-2xl">
          <Trophy className="w-16 h-16 text-amber-400 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-100">Expedition Completed!</h2>
          <p className="text-sm text-slate-300">
            You achieved an expedition score of{' '}
            <span className="font-mono font-bold text-cyan-400 text-lg">{score}</span> points!
          </p>
          <div className="text-xs text-slate-400">
            {score > 600 ? '🎖️ Planetary Master Navigator' : '🌍 Experienced Global Explorer'}
          </div>

          <div className="pt-2">
            <button
              onClick={handleReset}
              className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg cursor-pointer flex items-center space-x-2 mx-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Explore Again</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

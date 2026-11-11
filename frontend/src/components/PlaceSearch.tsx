import { useEffect, useRef, useState } from 'react';
import type { AreaBounds } from '../map/HotspotMap';

export interface PlaceItem {
  id: string;
  name: string;
  category: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  bounds?: AreaBounds;
}

const PLACES_CATALOG: PlaceItem[] = [
  {
    id: 'bd-all',
    name: 'Bangladesh (All National Bbox)',
    category: 'National Scope',
    center: [90.35, 23.6],
    zoom: 6.2,
    bounds: [88.0, 20.5, 92.7, 26.7],
  },
  {
    id: 'sundarbans',
    name: 'Sundarbans Mangrove Forest',
    category: 'Protected Forest / Delta',
    center: [89.54, 21.95],
    zoom: 9.2,
    bounds: [89.0, 21.5, 90.0, 22.5],
  },
  {
    id: 'cht',
    name: 'Chittagong Hill Tracts (CHT)',
    category: 'Forested Highlands / Active Fire Belt',
    center: [92.22, 22.5],
    zoom: 8.8,
    bounds: [91.8, 21.4, 92.7, 23.8],
  },
  {
    id: 'coxs-bazar',
    name: 'Cox’s Bazar & Coastal Belt',
    category: 'Southeast Coast',
    center: [91.99, 21.43],
    zoom: 9.8,
    bounds: [91.7, 21.0, 92.3, 21.8],
  },
  {
    id: 'teknaf',
    name: 'Teknaf & Naf River Border',
    category: 'Southern Border Peninsula',
    center: [92.3, 20.87],
    zoom: 10.2,
    bounds: [92.15, 20.7, 92.4, 21.1],
  },
  {
    id: 'bandarban',
    name: 'Bandarban Hills',
    category: 'Montane Forest',
    center: [92.22, 22.2],
    zoom: 9.8,
    bounds: [92.0, 21.7, 92.6, 22.4],
  },
  {
    id: 'rangamati',
    name: 'Rangamati & Kaptai Basin',
    category: 'Hills & Lake Basin',
    center: [92.18, 22.65],
    zoom: 9.5,
    bounds: [91.9, 22.3, 92.5, 23.1],
  },
  {
    id: 'sylhet',
    name: 'Sylhet & Surma Valley',
    category: 'Northeast Tea & Haor Region',
    center: [91.87, 24.89],
    zoom: 9.6,
    bounds: [91.4, 24.5, 92.4, 25.2],
  },
  {
    id: 'sreemangal',
    name: 'Sreemangal & Lawachara Forest',
    category: 'Tea Gardens & Tropical Rainforest',
    center: [91.73, 24.31],
    zoom: 10.5,
    bounds: [91.6, 24.15, 91.9, 24.45],
  },
  {
    id: 'dhaka',
    name: 'Dhaka Metropolitan & Central',
    category: 'Capital / Central Division',
    center: [90.41, 23.81],
    zoom: 9.8,
    bounds: [90.1, 23.5, 90.7, 24.1],
  },
  {
    id: 'chittagong',
    name: 'Chittagong (Chattogram City)',
    category: 'Port City / Coast',
    center: [91.83, 22.36],
    zoom: 9.8,
    bounds: [91.6, 22.1, 92.1, 22.6],
  },
  {
    id: 'rajshahi',
    name: 'Rajshahi & Barind Tract',
    category: 'Northwest Agriculture',
    center: [88.6, 24.37],
    zoom: 9.5,
    bounds: [88.2, 24.1, 89.0, 24.8],
  },
  {
    id: 'bogra',
    name: 'Bogra (Bogura)',
    category: 'North-Central Agricultural Hub',
    center: [89.37, 24.85],
    zoom: 9.6,
    bounds: [89.1, 24.6, 89.6, 25.1],
  },
  {
    id: 'rangpur',
    name: 'Rangpur Division',
    category: 'Northern Plains',
    center: [89.24, 25.74],
    zoom: 9.2,
    bounds: [88.8, 25.3, 89.6, 26.1],
  },
  {
    id: 'dinajpur',
    name: 'Dinajpur',
    category: 'Northwest Grain Belt',
    center: [88.64, 25.63],
    zoom: 9.6,
    bounds: [88.4, 25.3, 89.0, 26.0],
  },
  {
    id: 'khulna',
    name: 'Khulna City & Rupsha',
    category: 'Southwest Delta Hub',
    center: [89.54, 22.85],
    zoom: 9.8,
    bounds: [89.3, 22.6, 89.8, 23.1],
  },
  {
    id: 'barisal',
    name: 'Barisal (Barishal)',
    category: 'Southern Estuarine Floodplain',
    center: [90.37, 22.7],
    zoom: 9.5,
    bounds: [90.1, 22.4, 90.7, 23.0],
  },
  {
    id: 'mymensingh',
    name: 'Mymensingh',
    category: 'Old Brahmaputra Valley',
    center: [90.41, 24.75],
    zoom: 9.5,
    bounds: [90.1, 24.4, 90.7, 25.1],
  },
  {
    id: 'comilla',
    name: 'Comilla (Cumilla)',
    category: 'Eastern Plains / Tripura Border',
    center: [91.18, 23.46],
    zoom: 9.6,
    bounds: [90.9, 23.2, 91.5, 23.8],
  },
  {
    id: 'kuakata',
    name: 'Kuakata Coastal Beach',
    category: 'Southern Shoreline',
    center: [90.12, 21.82],
    zoom: 10.0,
    bounds: [89.9, 21.6, 90.3, 22.0],
  },
];

export interface PlaceSearchProps {
  onSelectPlace: (place: PlaceItem, applyAsAreaFilter?: boolean) => void;
}

export function PlaceSearch({ onSelectPlace }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredPlaces = query.trim()
    ? PLACES_CATALOG.filter(
        p =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.category.toLowerCase().includes(query.toLowerCase()),
      )
    : PLACES_CATALOG;

  // Global '/' keyboard shortcut to trigger search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        const tagName = document.activeElement?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (place: PlaceItem, asFilter = false) => {
    onSelectPlace(place, asFilter);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredPlaces.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredPlaces.length) % filteredPlaces.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredPlaces[selectedIndex]) {
        handleSelect(filteredPlaces[selectedIndex]);
      }
    }
  };

  return (
    <div ref={containerRef} className="place-search-container">
      <div className="place-search-box">
        <svg
          className="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="place-search-input"
          placeholder="Search a place..."
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          aria-label="Search geographic place in Bangladesh"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {query ? (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search query"
          >
            ✕
          </button>
        ) : (
          <kbd className="search-shortcut" title="Press / to focus">
            /
          </kbd>
        )}
      </div>

      {isOpen && (
        <div className="place-search-dropdown" role="listbox">
          <div className="search-dropdown-header">
            <span>GEOGRAPHIC REGIONS & SATELLITE FOCUS AREAS</span>
            <span className="search-count">{filteredPlaces.length} locations</span>
          </div>
          <div className="search-results-list">
            {filteredPlaces.length === 0 ? (
              <div className="search-no-results">No locations matching &ldquo;{query}&rdquo;</div>
            ) : (
              filteredPlaces.map((place, index) => (
                <div
                  key={place.id}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={`search-result-item ${index === selectedIndex ? 'is-selected' : ''}`}
                  onClick={() => handleSelect(place)}
                >
                  <div className="result-main">
                    <span className="result-name">{place.name}</span>
                    <span className="result-category">{place.category}</span>
                  </div>
                  <div className="result-actions" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="result-action-btn"
                      title="Fly map to location"
                      onClick={() => handleSelect(place, false)}
                    >
                      Fly to
                    </button>
                    {place.bounds && (
                      <button
                        type="button"
                        className="result-action-btn is-filter"
                        title="Filter observations to this area"
                        onClick={() => handleSelect(place, true)}
                      >
                        Set Area
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

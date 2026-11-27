import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Film,
  Calendar,
  Users,
  Globe,
  Download,
  Play,
  ExternalLink,
  X,
  AlertCircle,
  HardDrive,
  Clock,
  Maximize2,
  FolderOpen,
  Heart,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import imageNotFound from './assets/image-not-found.jpg';
import resultNotFound from './assets/result-not-found.jpg';


const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';
const CURRENT_YEAR = new Date().getFullYear().toString();
const LATEST_PER_PAGE = 25;

export default function App() {
  const [category, setCategory] = useState('tamil'); // 'tamil' (default) | 'dubbed'
  const [activeCategory, setActiveCategory] = useState('tamil');
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('name'); // 'name' | 'year' | 'actor'
  const [activeQuery, setActiveQuery] = useState('latest');
  const [activeSearchType, setActiveSearchType] = useState('name');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [movies, setMovies] = useState([]);
  const [proxyPosters, setProxyPosters] = useState({});
  const [brokenPosters, setBrokenPosters] = useState({});
  const [isMobileView, setIsMobileView] = useState(
    typeof window !== 'undefined' && window.innerWidth <= 600
  );
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [activeSeason, setActiveSeason] = useState('ALL');
  const [activeFolderGroup, setActiveFolderGroup] = useState('ALL');
  const [modalFileFilter, setModalFileFilter] = useState('');
  const [movieDetails, setMovieDetails] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDownloads, setLoadingDownloads] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [actors, setActors] = useState([]);
  const [selectedActor, setSelectedActor] = useState(null);
  const [isDomainPage, setIsDomainPage] = useState(
    typeof window !== 'undefined' &&
      window.location.pathname.replace(/\/+$/, '').toLowerCase() === '/domain'
  );
  const [tamilUrlInput, setTamilUrlInput] = useState('');
  const [hollywoodUrlInput, setHollywoodUrlInput] = useState('');
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [savingDomains, setSavingDomains] = useState(false);
  const [domainMessage, setDomainMessage] = useState('');
  const [domainError, setDomainError] = useState('');
  const resultsSectionRef = useRef(null);
  const shouldScrollToResultsRef = useRef(false);
  const searchCacheRef = useRef(new Map());
  const downloadsCacheRef = useRef(new Map());

  const scrollToMoviesList = () => {
    setTimeout(() => {
      if (resultsSectionRef.current) {
        resultsSectionRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }, 80);
  };

  const fetchMovies = async (
    searchQuery,
    targetPage = 1,
    mode = searchType,
    autoScroll = false,
    cat = category
  ) => {
    const cacheKey = `${cat}::${mode}::${(searchQuery || 'latest').toLowerCase().trim()}::${targetPage}`;
    if (searchCacheRef.current.has(cacheKey)) {
      const cached = searchCacheRef.current.get(cacheKey);
      setError('');
      setSearched(true);
      setMovies(cached.movies);
      setHasMore(cached.hasMore);
      setTotalPages(cached.totalPages);
      if (cached.actors) setActors(cached.actors);
      if (cached.selectedActor !== undefined) setSelectedActor(cached.selectedActor);
      setPage(targetPage);
      setActiveQuery(searchQuery);
      setActiveSearchType(mode);
      setActiveCategory(cat);
      if (autoScroll && cached.movies.length > 0) {
        scrollToMoviesList();
      }
      return;
    }

    setLoadingSearch(true);
    setError('');
    setSearched(true);
    setMovies([]);
    setProxyPosters({});
    setBrokenPosters({});
    shouldScrollToResultsRef.current = autoScroll;

    try {
      const res = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(searchQuery)}&page=${targetPage}&limit=${LATEST_PER_PAGE}&type=${encodeURIComponent(mode)}&category=${encodeURIComponent(cat)}`
      );
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setMovies(data);
        setHasMore(false);
        setTotalPages(1);
        searchCacheRef.current.set(cacheKey, {
          movies: data,
          hasMore: false,
          totalPages: 1
        });
      } else {
        const loadedMovies = data.movies || [];
        const loadedHasMore = Boolean(data.hasMore);
        const loadedTotalPages = data.totalPages || 1;
        setMovies(loadedMovies);
        setHasMore(loadedHasMore);
        setTotalPages(loadedTotalPages);
        if (data.actors) {
          setActors(data.actors);
        }
        if (data.selectedActor !== undefined) {
          setSelectedActor(data.selectedActor);
        }
        if (data.baseUrl) {
          console.log('BASE_URL:', data.baseUrl);
        }
        searchCacheRef.current.set(cacheKey, {
          movies: loadedMovies,
          hasMore: loadedHasMore,
          totalPages: loadedTotalPages,
          actors: data.actors,
          selectedActor: data.selectedActor
        });
      }
      setPage(targetPage);
      setActiveQuery(searchQuery);
      setActiveSearchType(mode);
      setActiveCategory(cat);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to fetch movies. Make sure the backend server is running.');
    } finally {
      setLoadingSearch(false);
    }
  };

  useEffect(() => {
    if (!loadingSearch && movies.length > 0 && shouldScrollToResultsRef.current) {
      shouldScrollToResultsRef.current = false;
      scrollToMoviesList();
    }
  }, [loadingSearch, movies]);

  useEffect(() => {
    const onPopState = () => {
      setIsDomainPage(
        window.location.pathname.replace(/\/+$/, '').toLowerCase() === '/domain'
      );
    };
    const onResize = () => {
      setIsMobileView(window.innerWidth <= 600);
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (isDomainPage) {
      setLoadingDomains(true);
      setDomainError('');
      fetch(`${API_BASE}/domain`)
        .then((r) => r.json())
        .then((d) => {
          setTamilUrlInput(d.baseUrl || 'https://moviesda36.com');
          setHollywoodUrlInput(d.dubbedBaseUrl || 'https://isaidub.green');
        })
        .catch(() => {
          setDomainError('Failed to load current domain configuration.');
        })
        .finally(() => {
          setLoadingDomains(false);
        });
    } else {
      fetchMovies('latest', 1, 'name', false, 'tamil');
    }
  }, [isDomainPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveDomains = async (e) => {
    e.preventDefault();
    setSavingDomains(true);
    setDomainMessage('');
    setDomainError('');
    try {
      const res = await fetch(`${API_BASE}/domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: tamilUrlInput.trim(),
          dubbedBaseUrl: hollywoodUrlInput.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update domains');
      }
      setTamilUrlInput(data.baseUrl);
      setHollywoodUrlInput(data.dubbedBaseUrl);
      searchCacheRef.current.clear();
      downloadsCacheRef.current.clear();
      setDomainMessage('Domains updated globally without redeployment!');
    } catch (err) {
      setDomainError(err.message || 'Failed to save domain URLs.');
    } finally {
      setSavingDomains(false);
    }
  };

  const navigateHome = () => {
    window.history.pushState({}, '', '/');
    setIsDomainPage(false);
  };

  const handleCategoryChange = async (newCategory) => {
    if (newCategory === category) return;
    setCategory(newCategory);
    setSelectedActor(null);

    if (searchType === 'actor') {
      setSearchType('name');
      setQuery('');
      await fetchMovies('latest', 1, 'name', false, newCategory);
      return;
    }

    const cleanQuery = query.trim();
    if (cleanQuery) {
      await fetchMovies(cleanQuery, 1, searchType, false, newCategory);
    } else {
      await fetchMovies('latest', 1, searchType, false, newCategory);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    const cleanQuery = query.trim();
    if (e && cleanQuery && typeof window !== 'undefined' && window.umami) {
      window.umami.track(`Movie: ${cleanQuery}`, {
        name: cleanQuery,
        type: searchType,
        category
      });
    }
    const targetQuery =
      cleanQuery ||
      (searchType === 'actor'
        ? selectedActor?.name || 'Vijay'
        : searchType === 'year'
          ? CURRENT_YEAR
          : 'latest');
    await fetchMovies(
      targetQuery,
      1,
      searchType,
      searchType === 'actor' || Boolean(cleanQuery),
      category
    );
  };

  const handleTabChange = async (newType) => {
    if (newType === searchType) return;
    setSearchType(newType);
    if (newType === 'actor') {
      setQuery('');
      await fetchMovies('Vijay', 1, 'actor', false, category);
    } else if (newType === 'year') {
      setSelectedActor(null);
      setQuery(CURRENT_YEAR);
      await fetchMovies(CURRENT_YEAR, 1, 'year', false, category);
    } else {
      setSelectedActor(null);
      setQuery('');
      await fetchMovies('latest', 1, 'name', false, category);
    }
  };

  const handleSelectActor = async (actor) => {
    setQuery(actor.name);
    setSelectedActor(actor);
    if (typeof window !== 'undefined' && window.umami) {
      window.umami.track(`Actor: ${actor.name}`, { actor: actor.name, type: 'actor' });
    }
    await fetchMovies(actor.path, 1, 'actor', true, 'tamil');
  };

  const handleClearSearch = async () => {
    setQuery('');
    // Stay on the current active toggle (searchType & category)
    if (searchType === 'year') {
      setSelectedActor(null);
      setMovies([]);
      setSearched(false);
      setHasMore(false);
      setTotalPages(1);
    } else if (searchType === 'actor') {
      setSelectedActor(null);
      setMovies([]);
      setSearched(false);
      setHasMore(false);
      setTotalPages(1);
    } else {
      setSelectedActor(null);
      if (activeQuery !== 'latest' || activeSearchType !== 'name' || page !== 1) {
        await fetchMovies('latest', 1, 'name', false, category);
      }
    }
  };

  const handleNextPage = async () => {
    if (loadingSearch || !hasMore) return;
    const nextPage = page + 1;
    await fetchMovies(activeQuery, nextPage, activeSearchType, true, activeCategory);
  };

  const handlePrevPage = async () => {
    if (loadingSearch || page <= 1) return;
    const prevPage = page - 1;
    await fetchMovies(activeQuery, prevPage, activeSearchType, true, activeCategory);
  };

  const handleFetchDownloads = async (movie) => {
    setSelectedMovie(movie);
    setActiveSeason('ALL');
    setActiveFolderGroup('ALL');
    setModalFileFilter('');
    setError('');

    const movieCat = movie.category || activeCategory || category;
    const dlCacheKey = `${movieCat}::${movie.path}`;
    if (downloadsCacheRef.current.has(dlCacheKey)) {
      const cachedDl = downloadsCacheRef.current.get(dlCacheKey);
      setDownloads(cachedDl.downloads);
      setMovieDetails(cachedDl.movieInfo);
      setLoadingDownloads(false);
      return;
    }

    setLoadingDownloads(true);
    setDownloads([]);
    setMovieDetails(null);

    try {
      const res = await fetch(
        `${API_BASE}/downloads?path=${encodeURIComponent(movie.path)}&category=${encodeURIComponent(movieCat)}`
      );
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      const data = await res.json();
      if (data && data.downloads) {
        setDownloads(data.downloads);
        setMovieDetails(data.movieInfo);
        downloadsCacheRef.current.set(dlCacheKey, {
          downloads: data.downloads,
          movieInfo: data.movieInfo
        });
      } else {
        setDownloads(data || []);
        setMovieDetails(null);
        downloadsCacheRef.current.set(dlCacheKey, {
          downloads: data || [],
          movieInfo: null
        });
      }
    } catch (err) {
      console.error('Downloads fetch error:', err);
      setError(`Failed to extract download links for "${movie.title}".`);
    } finally {
      setLoadingDownloads(false);
    }
  };

  const closeModal = () => {
    setSelectedMovie(null);
    setDownloads([]);
    setActiveSeason('ALL');
    setActiveFolderGroup('ALL');
    setModalFileFilter('');
    setMovieDetails(null);
    setLoadingDownloads(false);
  };

  // Helper to extract year from title like "Leo (2023)"
  const extractYear = (title) => {
    const match = title.match(/\((\d{4})\)/);
    return match ? match[1] : 'Classic';
  };

  // Clean title text by removing year bracket
  const cleanTitle = (title) => {
    return title.replace(/\s*\(\d{4}\)\s*/g, '').trim();
  };

  if (isDomainPage) {
    return (
      <div className="app-container">
        <header className="site-header">
          <div className="logo-wrapper">
            <h1 className="gradient-title">Domain Configuration</h1>
            <span className="subtitle">Update Source URLs Without Redeployment</span>
          </div>
        </header>

        <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
          <div className="glass-card domain-config-card">
            {loadingDomains ? (
              <div className="loader-container" style={{ padding: '2rem 0' }}>
                <div className="pulse-spinner"></div>
                <span className="loading-text">Loading current domains...</span>
              </div>
            ) : (
              <form className="domain-config-form" onSubmit={handleSaveDomains}>
                <div className="domain-field-group">
                  <label className="domain-label" htmlFor="tamil-url-input">
                    <Film size={16} />
                    Tamil Movies Base URL
                  </label>
                  <input
                    id="tamil-url-input"
                    type="url"
                    className="domain-input"
                    placeholder="https://moviesda36.com"
                    value={tamilUrlInput}
                    onChange={(e) => setTamilUrlInput(e.target.value)}
                    required
                  />
                </div>

                <div className="domain-field-group">
                  <label className="domain-label" htmlFor="hollywood-url-input">
                    <Globe size={16} />
                    Hollywood Movies Base URL
                  </label>
                  <input
                    id="hollywood-url-input"
                    type="url"
                    className="domain-input"
                    placeholder="https://isaidub.green"
                    value={hollywoodUrlInput}
                    onChange={(e) => setHollywoodUrlInput(e.target.value)}
                    required
                  />
                </div>

                {domainError && (
                  <div className="domain-alert domain-alert-error">
                    <AlertCircle size={18} />
                    <span>{domainError}</span>
                  </div>
                )}

                {domainMessage && (
                  <div className="domain-alert domain-alert-success">
                    <span>✓ {domainMessage}</span>
                  </div>
                )}

                <div className="domain-actions-row">
                  <button
                    type="button"
                    className="pagination-btn pagination-btn-prev"
                    onClick={navigateHome}
                  >
                    <ChevronLeft size={18} />
                    Back to Home
                  </button>
                  <button
                    type="submit"
                    className="search-button"
                    disabled={savingDomains}
                  >
                    {savingDomains ? 'Saving...' : 'Save & Apply Domains'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </main>

        <footer className="site-footer">
          <p>
            Developed with <Heart className="heart-icon" size={16} /> by{' '}
            <a href="https://www.kabilan.in" target="_blank" rel="noopener noreferrer" className="developer-name">Kabilan</a> &copy; 2026
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="site-header">
        <div className="logo-wrapper">
          <h1 className="gradient-title">Moviesda Web Search Portal</h1>
          <span className="subtitle">Name of Quality</span>
        </div>
      </header>

      <main>
        {/* Search Bar Section */}
        <section className="search-section">
          <div className="search-container-vertical">
            {/* Main Toggle: Tamil Movies vs Dubbed Movies */}
            <div className="main-category-toggle" role="tablist" aria-label="Movie Category">
              <button
                type="button"
                role="tab"
                aria-selected={category === 'tamil'}
                className={`main-category-btn ${category === 'tamil' ? 'active' : ''}`}
                onClick={() => handleCategoryChange('tamil')}
                disabled={loadingSearch || loadingDownloads}
              >
                <Film size={17} />
                Tamil Movies
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'dubbed'}
                className={`main-category-btn ${category === 'dubbed' ? 'active' : ''}`}
                onClick={() => handleCategoryChange('dubbed')}
                disabled={loadingSearch || loadingDownloads}
              >
                <Globe size={17} />
                Hollywood Movies
              </button>
            </div>

            {/* Sub-Tab Toggle */}
            <div className="search-mode-tabs" role="tablist" aria-label="Search Mode">
              <button
                type="button"
                role="tab"
                aria-selected={searchType === 'name'}
                className={`search-mode-tab ${searchType === 'name' ? 'active' : ''}`}
                onClick={() => handleTabChange('name')}
                disabled={loadingSearch || loadingDownloads}
              >
                <Film size={15} />
                Movie Name
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchType === 'year'}
                className={`search-mode-tab ${searchType === 'year' ? 'active' : ''}`}
                onClick={() => handleTabChange('year')}
                disabled={loadingSearch || loadingDownloads}
              >
                <Calendar size={15} />
                Year Search
              </button>
              {category === 'tamil' && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={searchType === 'actor'}
                  className={`search-mode-tab ${searchType === 'actor' ? 'active' : ''}`}
                  onClick={() => handleTabChange('actor')}
                  disabled={loadingSearch || loadingDownloads}
                >
                  <Users size={15} />
                  Actor Wise
                </button>
              )}
            </div>

            <form className="search-bar-wrapper" onSubmit={handleSearch}>
              <Search className="search-icon" size={22} />
              <input
                type="text"
                className="search-input"
                placeholder={
                  searchType === 'year'
                    ? isMobileView
                      ? 'Year: 2026, 2025, 2018...'
                      : 'Search by release year (e.g. 2026, 2025, 2018)...'
                    : searchType === 'actor'
                      ? isMobileView
                        ? 'Actor: Vijay, Ajith, Suriya...'
                        : 'Search or filter actor name (e.g. Vijay, Ajith, Suriya, Dhanush)...'
                      : category === 'dubbed'
                        ? isMobileView
                          ? 'Search: Spiderman, Avengers, Matrix...'
                          : 'Search Hollywood movies (e.g. Spiderman, Avengers, Matrix, Money Heist)...'
                        : isMobileView
                          ? 'Search: Dude, 96, Leo, Karuppu...'
                          : 'Search movie name (e.g. Dude, 96, Leo, Karuppu, Soorarai Pottru)...'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loadingSearch || loadingDownloads}
              />
              {(query.length > 0 || (searchType === 'name' && activeQuery !== 'latest')) && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={handleClearSearch}
                  disabled={loadingSearch || loadingDownloads}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
              <button type="submit" className="search-button" disabled={loadingSearch}>
                {loadingSearch
                  ? 'Searching...'
                  : searchType === 'year'
                    ? 'Search Year'
                    : searchType === 'actor'
                      ? 'Search Actor'
                      : 'Search Movie'}
              </button>
            </form>

            {category === 'tamil' && searchType === 'actor' && actors.length > 0 && (
              <div className="actor-chips-wrapper">
                {actors
                  .filter((actor) => {
                    const q = query.trim().toLowerCase();
                    if (!q || (selectedActor && selectedActor.name.toLowerCase() === q)) return true;
                    return (
                      actor.name.toLowerCase().includes(q) ||
                      actor.fullName.toLowerCase().includes(q)
                    );
                  })
                  .map((actor) => {
                    const isSelected =
                      selectedActor?.path === actor.path ||
                      selectedActor?.name === actor.name;
                    return (
                      <button
                        key={actor.path}
                        type="button"
                        className={`actor-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handleSelectActor(actor)}
                        disabled={loadingSearch}
                      >
                        {actor.name}
                      </button>
                    );
                  })}
              </div>
            )}

            <p className="disclaimer-text front-disclaimer">
              * Please enter the{' '}
              <span className="highlight-disclaimer">
                correct{' '}
                {searchType === 'year'
                  ? 'release year'
                  : searchType === 'actor'
                    ? 'actor name or select an actor above'
                    : 'movie spelling'}
              </span>{' '}
              to get the correct result.
            </p>
          </div>
        </section>

        {/* Global Error Banner */}
        {error && (
          <div className="glass-card" style={{ padding: '1.2rem 1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderLeft: '4px solid #ef4444' }}>
            <AlertCircle color="#ef4444" size={24} />
            <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{error}</span>
          </div>
        )}

        {/* Search Loading spinner */}
        {loadingSearch && (
          <div className="loader-container">
            <div className="pulse-spinner"></div>
            <span className="loading-text">Loadig movie directories...</span>
          </div>
        )}

        {/* Search Results Display */}
        {!loadingSearch && searched && movies.length === 0 && (
          <div className="empty-state">
            <img
              src={resultNotFound}
              alt="Result Not Found"
              className="result-not-found-img"
            />
            <p className="disclaimer-text">
              * Please enter the <span className="highlight-disclaimer">correct {searchType === 'year' ? 'release year' : searchType === 'actor' ? 'actor name' : 'movie spelling'}</span> to get the correct result.
            </p>
          </div>
        )}

        {!loadingSearch && movies.length > 0 && (
          <section ref={resultsSectionRef} className="results-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.4rem', opacity: 0.9 }}>
                {activeSearchType === 'actor' && selectedActor
                  ? `${selectedActor.name} Movies`
                  : activeQuery === 'latest'
                    ? activeCategory === 'dubbed'
                      ? 'Latest Hollywood Movies'
                      : 'Latest Movies'
                    : activeSearchType === 'year'
                      ? `${activeCategory === 'dubbed' ? 'Hollywood ' : ''}Year Results for "${activeQuery}"`
                      : `${activeCategory === 'dubbed' ? 'Hollywood ' : ''}Movie Results for "${activeQuery}"`}{' '}
                ({movies.length})
              </h2>
              {totalPages > 1 && (
                <span style={{ fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                  Page {page} of {totalPages}
                </span>
              )}
            </div>
            <div className="results-grid">
              {movies.map((movie, idx) => (
                <div
                  key={movie.path || idx}
                  className="glass-card movie-card-enriched"
                  onClick={() => handleFetchDownloads(movie)}
                >
                  <div className="card-poster-wrapper">
                    {(() => {
                      const cardKey = movie.path || idx;
                      const proxyUrl = `${API_BASE}/image?url=${encodeURIComponent(movie.poster || '')}&pageUrl=${encodeURIComponent(movie.url || '')}&title=${encodeURIComponent(movie.title || '')}`;
                      const useProxy = !movie.poster || proxyPosters[cardKey];

                      if (brokenPosters[cardKey]) {
                        return (
                          <img
                            src={imageNotFound}
                            alt={`${movie.title} - Image Not Found`}
                            className="card-poster-img card-poster-fallback"
                            loading="lazy"
                          />
                        );
                      }

                      return (
                        <img
                          src={useProxy ? proxyUrl : movie.poster}
                          alt={movie.title}
                          className="card-poster-img"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() => {
                            if (!useProxy) {
                              setProxyPosters((prev) => ({
                                ...prev,
                                [cardKey]: true
                              }));
                            } else {
                              setBrokenPosters((prev) => ({
                                ...prev,
                                [cardKey]: true
                              }));
                            }
                          }}
                        />
                      );
                    })()}
                    <span className="badge-year-floating">{extractYear(movie.title)}</span>
                  </div>

                  <div className="card-info-content">
                    <h3 className="movie-title-simple" title={cleanTitle(movie.title)}>
                      {cleanTitle(movie.title)}
                    </h3>
                    <div className="movie-links-row">
                      <a
                        href={movie.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="original-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={13} />
                        Original
                      </a>
                      <button className="btn-action-trigger-small">
                        <Download size={13} />
                        Links
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Next / Previous Pagination for Latest 25 Movies */}
            {(page > 1 || hasMore) && (
              <div className="pagination-container">
                {page > 1 && (
                  <button
                    type="button"
                    className="pagination-btn pagination-btn-prev"
                    onClick={handlePrevPage}
                    disabled={loadingSearch}
                  >
                    <ChevronLeft size={18} />
                    Previous
                  </button>
                )}
                <span className="pagination-page-indicator">
                  Page {page}{totalPages > 1 ? ` of ${totalPages}` : ''}
                </span>
                {hasMore && (
                  <button
                    type="button"
                    className="pagination-btn pagination-btn-next"
                    onClick={handleNextPage}
                    disabled={loadingSearch}
                  >
                    Next
                    <ChevronRight size={18} />
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="site-footer">
        <p>
          Developed with <Heart className="heart-icon" size={16} /> by{' '}
          <a href="https://www.kabilan.in" target="_blank" rel="noopener noreferrer" className="developer-name">Kabilan</a> &copy; 2026
        </p>
      </footer>

      {/* Modal Dialog Details & Servers Drawer */}
      {selectedMovie && (
        <div className="details-modal-overlay" onClick={closeModal}>
          <div
            className="glass-card details-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close-btn" onClick={closeModal}>
              <X size={18} />
            </button>

            <div className="modal-header">
              <h2 className="modal-title">{cleanTitle(selectedMovie.title)}</h2>
              <div className="modal-subtitle">
                <span className="badge-year">{extractYear(selectedMovie.title)}</span>
                <span style={{ color: '#6b7280' }}>|</span>
                <span style={{ fontSize: '0.9rem', color: '#9ca3af' }}>Path: {selectedMovie.path}</span>
              </div>
            </div>

            {loadingDownloads && (
              <div className="loader-container">
                <div className="pulse-spinner"></div>
                <span className="loading-text">Loading movie files & extracting download servers...</span>
              </div>
            )}

            {!loadingDownloads && (
              <div className="modal-body-layout">
                {/* Left side: Movie info if available */}
                {movieDetails && (
                  <div className="movie-details-panel">
                    <div className="poster-container">
                      <img
                        src={movieDetails.poster || `${API_BASE}/image?pageUrl=${encodeURIComponent(selectedMovie?.url || '')}&title=${encodeURIComponent(selectedMovie?.title || '')}`}
                        alt={`${movieDetails.title || 'Movie'} Poster`}
                        className="poster-img"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const proxyFallback = `${API_BASE}/image?url=${encodeURIComponent(movieDetails.poster || '')}&pageUrl=${encodeURIComponent(selectedMovie?.url || '')}&title=${encodeURIComponent(selectedMovie?.title || '')}`;
                          if (!e.currentTarget.dataset.proxied && movieDetails.poster) {
                            e.currentTarget.dataset.proxied = 'true';
                            e.currentTarget.src = proxyFallback;
                          } else {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = imageNotFound;
                            e.currentTarget.classList.add('card-poster-fallback');
                          }
                        }}
                      />
                    </div>
                    <div className="metadata-container">
                      <div className="metadata-title">Movie Info</div>
                      <div className="metadata-grid">
                        {movieDetails.director && (
                          <div className="metadata-item">
                            <span className="meta-label">Director:</span>
                            <span className="meta-val">{movieDetails.director}</span>
                          </div>
                        )}
                        {movieDetails.starring && (
                          <div className="metadata-item span-2">
                            <span className="meta-label">Cast:</span>
                            <span className="meta-val">{movieDetails.starring}</span>
                          </div>
                        )}
                        {movieDetails.genres && (
                          <div className="metadata-item">
                            <span className="meta-label">Genres:</span>
                            <span className="meta-val">{movieDetails.genres}</span>
                          </div>
                        )}
                        {movieDetails.quality && (
                          <div className="metadata-item">
                            <span className="meta-label">Quality:</span>
                            <span className="meta-val">{movieDetails.quality}</span>
                          </div>
                        )}
                        {movieDetails.language && (
                          <div className="metadata-item">
                            <span className="meta-label">Language:</span>
                            <span className="meta-val">{movieDetails.language}</span>
                          </div>
                        )}
                        {movieDetails.rating && (
                          <div className="metadata-item">
                            <span className="meta-label">Rating:</span>
                            <span className="meta-val highlight-rating">★ {movieDetails.rating}</span>
                          </div>
                        )}
                        {movieDetails.lastUpdated && (
                          <div className="metadata-item">
                            <span className="meta-label">Updated:</span>
                            <span className="meta-val">{movieDetails.lastUpdated}</span>
                          </div>
                        )}
                      </div>
                      {movieDetails.synopsis && (
                        <div className="synopsis-block">
                          <span className="synopsis-label">Synopsis:</span>
                          <p className="synopsis-text">{movieDetails.synopsis}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Right side: Downloads list */}
                <div className="downloads-panel">
                  {downloads.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem 0' }}>
                      <FolderOpen size={48} className="empty-icon" />
                      <h3 className="empty-title" style={{ fontSize: '1.1rem' }}>No direct downloads found</h3>
                      <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                        This movie folder may be empty, or contains links that point to external sites.
                      </p>
                      <a
                        href={selectedMovie.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="server-btn"
                        style={{ marginTop: '1rem', padding: '0.6rem 1.2rem', display: 'inline-flex' }}
                      >
                        Browse Manually
                        <ExternalLink size={14} style={{ marginLeft: '6px' }} />
                      </a>
                    </div>
                  ) : (
                    <div className="download-group">
                      {(() => {
                        // Helper to get or derive Season and Episode/Movie group for each file
                        const getSeason = (file) => {
                          if (file.seasonGroup) return file.seasonGroup;
                          const m = (file.fileName || '').match(/\b(?:season|s)\s*[-:.]?\s*(\d{1,2})\b/i);
                          return m ? `Season ${m[1].padStart(2, '0')}` : '';
                        };
                        const getEpisodeOrGroup = (file) => {
                          if (file.folderGroup) return file.folderGroup;
                          const m = (file.fileName || '').match(/\b(?:epi(?:sode)?|ep)\s*[-:.]?\s*(\d{1,3})\b/i);
                          return m ? `Episode ${m[1].padStart(2, '0')}` : '';
                        };

                        // Exclude 1-minute sample files if full files exist
                        const nonSampleDownloads = downloads.filter(
                          (f) => !/\bsample\b/i.test((f.fileName || '').trim())
                        );
                        const baseDownloads = nonSampleDownloads.length > 0 ? nonSampleDownloads : downloads;

                        const seasons = Array.from(
                          new Set(baseDownloads.map(getSeason).filter(Boolean))
                        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                        const hasSeasons = seasons.length > 1;

                        const seasonFilteredDownloads = baseDownloads.filter((file) => {
                          if (!hasSeasons || activeSeason === 'ALL') return true;
                          return getSeason(file) === activeSeason;
                        });

                        const folderGroups = Array.from(
                          new Set(seasonFilteredDownloads.map(getEpisodeOrGroup).filter(Boolean))
                        ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                        const hasMultipleGroups = folderGroups.length > 1;

                        const filteredDownloads = seasonFilteredDownloads.filter((file) => {
                          const grp = getEpisodeOrGroup(file);
                          if (hasMultipleGroups && activeFolderGroup !== 'ALL' && grp !== activeFolderGroup) {
                            return false;
                          }
                          if (modalFileFilter.trim()) {
                            const q = modalFileFilter.trim().toLowerCase();
                            return (
                              (file.fileName || '').toLowerCase().includes(q) ||
                              (getSeason(file) || '').toLowerCase().includes(q) ||
                              grp.toLowerCase().includes(q) ||
                              (file.resolution || '').toLowerCase().includes(q)
                            );
                          }
                          return true;
                        });

                        return (
                          <>
                            <div className="downloads-header-row">
                              <h3 style={{ fontSize: '1.15rem', color: '#f3f4f6' }}>
                                Available Formats & Resolving Links
                              </h3>
                              {baseDownloads.length > 6 && (
                                <div className="modal-file-filter-box">
                                  <Search size={14} className="modal-filter-icon" />
                                  <input
                                    type="text"
                                    className="modal-file-filter-input"
                                    placeholder="Quick filter season, episode, or quality..."
                                    value={modalFileFilter}
                                    onChange={(e) => setModalFileFilter(e.target.value)}
                                  />
                                  {modalFileFilter && (
                                    <button
                                      type="button"
                                      className="modal-filter-clear"
                                      onClick={() => setModalFileFilter('')}
                                    >
                                      <X size={13} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Season Filter Bar */}
                            {hasSeasons && (
                              <div className="filter-section-block">
                                <span className="filter-section-label">Seasons:</span>
                                <div className="folder-groups-bar season-groups-bar">
                                  <button
                                    type="button"
                                    className={`folder-group-chip season-chip ${activeSeason === 'ALL' ? 'active' : ''}`}
                                    onClick={() => {
                                      setActiveSeason('ALL');
                                      setActiveFolderGroup('ALL');
                                    }}
                                  >
                                    All Seasons ({baseDownloads.length})
                                  </button>
                                  {seasons.map((sec) => {
                                    const count = baseDownloads.filter((d) => getSeason(d) === sec).length;
                                    return (
                                      <button
                                        key={sec}
                                        type="button"
                                        className={`folder-group-chip season-chip ${activeSeason === sec ? 'active' : ''}`}
                                        onClick={() => {
                                          setActiveSeason(sec);
                                          setActiveFolderGroup('ALL');
                                        }}
                                      >
                                        {sec} ({count})
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Episode / Movie Part Filter Bar */}
                            {hasMultipleGroups && (
                              <div className="filter-section-block">
                                {hasSeasons && <span className="filter-section-label">Episodes:</span>}
                                <div className="folder-groups-bar">
                                  <button
                                    type="button"
                                    className={`folder-group-chip ${activeFolderGroup === 'ALL' ? 'active' : ''}`}
                                    onClick={() => setActiveFolderGroup('ALL')}
                                  >
                                    {hasSeasons ? 'All Episodes' : 'All'} ({seasonFilteredDownloads.length})
                                  </button>
                                  {folderGroups.map((grp) => {
                                    const count = seasonFilteredDownloads.filter(
                                      (d) => getEpisodeOrGroup(d) === grp
                                    ).length;
                                    return (
                                      <button
                                        key={grp}
                                        type="button"
                                        className={`folder-group-chip ${activeFolderGroup === grp ? 'active' : ''}`}
                                        onClick={() => setActiveFolderGroup(grp)}
                                      >
                                        {grp} ({count})
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {filteredDownloads.map((file, fIdx) => {
                              const fileSeason = getSeason(file);
                              const fileGroup = getEpisodeOrGroup(file);
                              const badgeLabel = [fileSeason, fileGroup].filter(Boolean).join(' • ');
                              return (
                                <div key={fIdx} className="file-item-card">
                                  {(hasSeasons || hasMultipleGroups) && badgeLabel && (
                                    <div className="file-folder-badge">
                                      {badgeLabel}
                                    </div>
                                  )}
                                  <div className="file-name">{file.fileName}</div>

                                <div className="file-item-meta">
                                  {file.fileSize && (
                                    <div className="meta-pill meta-pill-size">
                                      <HardDrive size={13} />
                                      {file.fileSize}
                                    </div>
                                  )}
                                  {file.duration && (
                                    <div className="meta-pill">
                                      <Clock size={13} />
                                      {file.duration}
                                    </div>
                                  )}
                                  {file.resolution && (
                                    <div className="meta-pill">
                                      <Maximize2 size={13} />
                                      {file.resolution}
                                    </div>
                                  )}
                                  {file.format && (
                                    <div className="meta-pill">
                                      Format: {file.format}
                                    </div>
                                  )}
                                </div>

                                {file.servers && file.servers.length > 0 && (
                                  <div className="server-links-container">
                                    {file.servers.map((srv, sIdx) => {
                                      const isWatchOnline = srv.name?.toLowerCase().includes('watch');
                                      return (
                                        <a
                                          key={sIdx}
                                          href={srv.url}
                                          target="_blank"
                                          rel="nofollow noopener noreferrer"
                                          className={isWatchOnline ? 'server-btn watch-server-btn' : 'server-btn'}
                                        >
                                          {isWatchOnline ? <Play size={14} /> : <Download size={14} />}
                                          {srv.name}
                                        </a>
                                      );
                                    })}
                                  </div>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

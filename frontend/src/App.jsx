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
  const [brokenPosters, setBrokenPosters] = useState({});
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [activeFolderGroup, setActiveFolderGroup] = useState('ALL');
  const [modalFileFilter, setModalFileFilter] = useState('');
  const [movieDetails, setMovieDetails] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDownloads, setLoadingDownloads] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [actors, setActors] = useState([]);
  const [selectedActor, setSelectedActor] = useState(null);
  const resultsSectionRef = useRef(null);
  const shouldScrollToResultsRef = useRef(false);

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
    setLoadingSearch(true);
    setError('');
    setSearched(true);
    setMovies([]);
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
      } else {
        setMovies(data.movies || []);
        setHasMore(Boolean(data.hasMore));
        setTotalPages(data.totalPages || 1);
        if (data.actors) {
          setActors(data.actors);
        }
        if (data.selectedActor !== undefined) {
          setSelectedActor(data.selectedActor);
        }
        if (data.baseUrl) {
          console.log('BASE_URL:', data.baseUrl);
        }
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
    fetchMovies('latest', 1, 'name', false, 'tamil');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryChange = async (newCategory) => {
    if (newCategory === category) return;
    setCategory(newCategory);
    setSearchType('name');
    setQuery('');
    setSelectedActor(null);
    await fetchMovies('latest', 1, 'name', false, newCategory);
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
    setLoadingDownloads(true);
    setDownloads([]);
    setActiveFolderGroup('ALL');
    setModalFileFilter('');
    setMovieDetails(null);
    setError('');

    try {
      const movieCat = movie.category || activeCategory || category;
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
      } else {
        setDownloads(data || []);
        setMovieDetails(null);
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
                    ? 'Search by release year (e.g. 2026, 2025, 2018)...'
                    : searchType === 'actor'
                      ? 'Search or filter actor name (e.g. Vijay, Ajith, Suriya, Dhanush)...'
                      : category === 'dubbed'
                        ? 'Search Hollywood movies, web series, collections (e.g. Spiderman, Matrix, Money Heist)...'
                        : 'Search movie name (e.g. Dude, 96, Leo, Karuppu, Soorarai Pottru, )...'
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
                    {movie.poster && !brokenPosters[movie.path || idx] ? (
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        className="card-poster-img"
                        loading="lazy"
                        onError={() =>
                          setBrokenPosters((prev) => ({
                            ...prev,
                            [movie.path || idx]: true
                          }))
                        }
                      />
                    ) : (
                      <img
                        src={imageNotFound}
                        alt={`${movie.title} - Image Not Found`}
                        className="card-poster-img card-poster-fallback"
                        loading="lazy"
                      />
                    )}
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
                        src={movieDetails.poster || imageNotFound}
                        alt={`${movieDetails.title || 'Movie'} Poster`}
                        className={`poster-img ${!movieDetails.poster ? 'card-poster-fallback' : ''}`}
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = imageNotFound;
                          e.currentTarget.classList.add('card-poster-fallback');
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
                        const folderGroups = Array.from(
                          new Set(downloads.map((d) => d.folderGroup).filter(Boolean))
                        );
                        const hasMultipleGroups = folderGroups.length > 1;
                        const filteredDownloads = downloads.filter((file) => {
                          if (hasMultipleGroups && activeFolderGroup !== 'ALL' && file.folderGroup !== activeFolderGroup) {
                            return false;
                          }
                          if (modalFileFilter.trim()) {
                            const q = modalFileFilter.trim().toLowerCase();
                            return (
                              (file.fileName || '').toLowerCase().includes(q) ||
                              (file.folderGroup || '').toLowerCase().includes(q) ||
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
                              {downloads.length > 6 && (
                                <div className="modal-file-filter-box">
                                  <Search size={14} className="modal-filter-icon" />
                                  <input
                                    type="text"
                                    className="modal-file-filter-input"
                                    placeholder="Quick filter episode or quality..."
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

                            {hasMultipleGroups && (
                              <div className="folder-groups-bar">
                                <button
                                  type="button"
                                  className={`folder-group-chip ${activeFolderGroup === 'ALL' ? 'active' : ''}`}
                                  onClick={() => setActiveFolderGroup('ALL')}
                                >
                                  All ({downloads.length})
                                </button>
                                {folderGroups.map((grp) => {
                                  const count = downloads.filter((d) => d.folderGroup === grp).length;
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
                            )}

                            {filteredDownloads.map((file, fIdx) => (
                              <div key={fIdx} className="file-item-card">
                                {hasMultipleGroups && file.folderGroup && (
                                  <div className="file-folder-badge">
                                    {file.folderGroup}
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
                            ))}
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

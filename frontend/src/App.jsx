import { useState, useEffect } from 'react';
import { 
  Search, 
  Film, 
  Download, 
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


const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';
const MOVIES_PER_PAGE = 15;

export default function App() {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('latest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [movies, setMovies] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [movieDetails, setMovieDetails] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDownloads, setLoadingDownloads] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const fetchMovies = async (searchQuery, targetPage = 1) => {
    setLoadingSearch(true);
    setError('');
    setSearched(true);
    setMovies([]);

    try {
      const res = await fetch(
        `${API_BASE}/search?q=${encodeURIComponent(searchQuery)}&page=${targetPage}&limit=${MOVIES_PER_PAGE}`
      );
      if (!res.ok) {
        throw new Error(`Server returned status: ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setMovies(data.slice(0, MOVIES_PER_PAGE));
        setHasMore(data.length > MOVIES_PER_PAGE);
        setTotalPages(1);
      } else {
        setMovies(data.movies || []);
        setHasMore(Boolean(data.hasMore));
        setTotalPages(data.totalPages || 1);
      }
      setPage(targetPage);
      setActiveQuery(searchQuery);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to fetch movies. Make sure the backend server is running.');
    } finally {
      setLoadingSearch(false);
    }
  };

  useEffect(() => {
    fetchMovies('latest', 1);
  }, []);

  const handleSearch = async (e) => {
    e?.preventDefault();
    const cleanQuery = query.trim();
    const targetQuery = cleanQuery || 'latest';
    await fetchMovies(targetQuery, 1);
  };

  const handleNextPage = async () => {
    if (loadingSearch || !hasMore) return;
    const nextPage = page + 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await fetchMovies(activeQuery, nextPage);
  };

  const handlePrevPage = async () => {
    if (loadingSearch || page <= 1) return;
    const prevPage = page - 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await fetchMovies(activeQuery, prevPage);
  };

  const handleFetchDownloads = async (movie) => {
    setSelectedMovie(movie);
    setLoadingDownloads(true);
    setDownloads([]);
    setMovieDetails(null);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/downloads?path=${encodeURIComponent(movie.path)}`);
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
            <form className="search-bar-wrapper" onSubmit={handleSearch}>
              <Search className="search-icon" size={22} />
              <input
                type="text"
                className="search-input"
                placeholder="Search movies....."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loadingSearch || loadingDownloads}
              />
              <button type="submit" className="search-button" disabled={loadingSearch}>
                {loadingSearch ? 'Searching...' : 'Search Movie'}
              </button>
            </form>
            <p className="disclaimer-text front-disclaimer">
              * Please enter the <span className="highlight-disclaimer">correct movie spelling</span> to get the correct result.
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
            <Film size={64} className="empty-icon" />
            <h2 className="empty-title">No Movies Found</h2>
            <p className="disclaimer-text">
              * Please enter the <span className="highlight-disclaimer">correct movie spelling</span> to get the correct result.
            </p>
          </div>
        )}

        {!loadingSearch && movies.length > 0 && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.4rem', opacity: 0.9 }}>
                {activeQuery === 'latest' ? 'Latest Movies' : `Search Results for "${activeQuery}"`} ({movies.length})
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
                  key={idx} 
                  className="glass-card movie-card-enriched"
                  onClick={() => handleFetchDownloads(movie)}
                >
                  <div className="card-poster-wrapper">
                    {movie.poster ? (
                      <img src={movie.poster} alt={movie.title} className="card-poster-img" loading="lazy" />
                    ) : (
                      <div className="card-poster-placeholder">
                        <Film size={40} style={{ opacity: 0.25 }} />
                      </div>
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

            {/* Bottom Pagination / Next Button */}
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
                    {movieDetails.poster && (
                      <div className="poster-container">
                        <img 
                          src={movieDetails.poster} 
                          alt={`${movieDetails.title || 'Movie'} Poster`} 
                          className="poster-img"
                        />
                      </div>
                    )}
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
                      <h3 style={{ fontSize: '1.15rem', marginBottom: '1.2rem', color: '#f3f4f6' }}>
                        Available Formats & Resolving Links
                      </h3>
                      {downloads.map((file, fIdx) => (
                        <div key={fIdx} className="file-item-card">
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
                              {file.servers.map((srv, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={srv.url}
                                  target="_blank"
                                  rel="nofollow noopener noreferrer"
                                  className="server-btn"
                                >
                                  <Download size={14} />
                                  {srv.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
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

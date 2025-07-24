import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import './ChatifyPage.css';

const socket = io('https://chatify-backend-knkq.onrender.com');

export default function ChatifyPage() {
  const [roomList, setRoomList] = useState([]);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);
  const [room, setRoom] = useState('');
  const [password, setPassword] = useState('');
  const [joined, setJoined] = useState(false);

  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [showChatSidebar, setShowChatSidebar] = useState(true);
  const [showMusicSidebar, setShowMusicSidebar] = useState(true);
  const [username, setUsername] = useState('');
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      // Don't close sidebars if search input is focused
      if (searchFocused) return;
      
      if (window.innerWidth <= 768) {
        setShowChatSidebar(false);
        setShowMusicSidebar(false);
      } else {
        setShowChatSidebar(true);
        setShowMusicSidebar(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    socket.on('connect', () => {
      console.log('Connected to socket server');
    });

    socket.on('room_list', (list) => setRoomList(list));

    socket.on('room_deleted', ({ room: deletedRoom }) => {
      if (room === deletedRoom) {
        setError(`Room "${deletedRoom}" was deleted.`);
        handleExitRoom();
      }
    });

    const handleReceiveMessage = ({ message, senderId, username, system }) => {
      if (system) {
        setChat((prev) => [...prev, { 
          text: message, 
          sender: 'system'
        }]);
      } else if (senderId === socket.id) {
        return;
      } else {
        setChat((prev) => [...prev, { 
          text: message, 
          sender: 'received',
          username
        }]);
      }
    };

    socket.on('receive_message', handleReceiveMessage);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.off('room_list');
      socket.off('room_deleted');
      socket.off('receive_message', handleReceiveMessage);
    };
  }, [room, searchFocused]);

  const toggleChatSidebar = () => {
    setShowChatSidebar(!showChatSidebar);
    if (window.innerWidth <= 768 && !showChatSidebar) {
      setShowMusicSidebar(false);
    }
  };

  const toggleMusicSidebar = () => {
    if (searchFocused) return; // Don't toggle if search is focused
    setShowMusicSidebar(!showMusicSidebar);
    if (window.innerWidth <= 768 && !showMusicSidebar) {
      setShowChatSidebar(false);
    }
  };

  const searchSongs = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(
        `https://archive.org/advancedsearch.php?q=${encodeURIComponent(searchQuery)} AND mediatype:(audio) AND format:(MP3)&fl[]=identifier,title,creator&rows=10&page=1&output=json`
      );
      const data = await res.json();

      const results = await Promise.all(
        data.response.docs.map(async (doc) => {
          const metaRes = await fetch(`https://archive.org/metadata/${doc.identifier}`);
          const metaData = await metaRes.json();
          const mp3File = metaData.files.find(f => f.name.endsWith('.mp3'));
          if (!mp3File) return null;

          const url = `https://archive.org/download/${doc.identifier}/${mp3File.name}`;

          return {
            title: doc.title,
            artist: doc.creator || 'Unknown Artist',
            url
          };
        })
      );

      setSearchResults(results.filter(song => song));
    } catch (err) {
      console.error('Error fetching songs:', err);
      setError('Failed to fetch songs');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateRoom = () => {
    if (!room || !password) {
      setError('Room name and password are required');
      return;
    }
    setIsCreatingRoom(true);
    setShowUsernameModal(true);
  };

  const handleJoinRoom = () => {
    if (!room || !password) {
      setError('Room name and password are required');
      return;
    }
    setIsCreatingRoom(false);
    setShowUsernameModal(true);
  };

  const confirmUsername = () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    const action = isCreatingRoom ? 'create_room' : 'join_room';
    socket.emit(action, { room, password, username }, (response) => {
      if (response.success) {
        setJoined(true);
        setError('');
        setChat([]);
        setShowUsernameModal(false);
      } else {
        setError(response.error);
      }
    });
  };

  const sendMessage = () => {
    if (message.trim() && room && username) {
      socket.emit('send_message', { room, message, username });
      setChat((prev) => [...prev, { 
        text: message, 
        sender: 'sent',
        username: 'You' 
      }]);
      setMessage('');
    }
  };

  const handleDeleteRoom = (roomName) => {
    setRoomToDelete(roomName);
    setShowDeleteModal(true);
  };

  const confirmDeleteRoom = () => {
    if (!deletePassword) {
      setError('Password is required');
      return;
    }

    socket.emit('delete_room', { room: roomToDelete, password: deletePassword }, (response) => {
      if (response.success) {
        setRoomList((prev) => prev.filter((r) => r !== roomToDelete));
        if (room === roomToDelete) handleExitRoom();
        setError('');
        setShowDeleteModal(false);
        setDeletePassword('');
      } else {
        setError(response.error);
      }
    });
  };

  const handleExitRoom = () => {
    socket.emit('leave_room', { room, username });
    setRoom('');
    setPassword('');
    setJoined(false);
    setChat([]);
    setUsername('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <div className="chatify-wrapper">
      {/* Username Modal */}
      {showUsernameModal && (
        <div className="modal-overlay">
          <div className="username-modal">
            <h3>Enter Your Username</h3>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              onKeyDown={(e) => e.key === 'Enter' && confirmUsername()}
            />
            {error && <p className="error-message">{error}</p>}
            <div className="modal-buttons">
              <button onClick={confirmUsername} className="btn">
                Confirm
              </button>
              <button 
                onClick={() => setShowUsernameModal(false)} 
                className="btn exit-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Room Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="username-modal">
            <h3>Delete Room: {roomToDelete}</h3>
            <input
              type="password"
              placeholder="Enter password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="input-field"
            />
            {error && <p className="error-message">{error}</p>}
            <div className="modal-buttons">
              <button onClick={confirmDeleteRoom} className="btn">
                Delete
              </button>
              <button 
                onClick={() => {
                  setShowDeleteModal(false);
                  setError('');
                }} 
                className="btn exit-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="chatify-header">
        <button 
          className={`hamburger ${showChatSidebar ? 'active' : ''}`} 
          onClick={toggleChatSidebar}
        >
          ☰
        </button>
        <button 
          className={`hamburger music-hamburger ${showMusicSidebar ? 'active' : ''}`} 
          onClick={toggleMusicSidebar}
        >
          ☰
        </button>
      </header>

      <aside className={`sidebar ${showChatSidebar ? 'open' : ''}`}>
        <h2>🎧 Chatify</h2>
        <nav>
          <ul>
            <li className="active">Private Rooms</li>
            {roomList.map((roomName, i) => (
              <li key={i} className="room-list-item">
                <span onClick={() => setRoom(roomName)}>{roomName}</span>
                <button onClick={() => handleDeleteRoom(roomName)}>✕</button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="main-content">
        {currentSong && (
          <div className="now-playing">
            <h3>Now Playing: {currentSong.title}</h3>
            <p>{currentSong.artist}</p>
            <audio key={currentSong.url} controls autoPlay>
              <source src={currentSong.url} type="audio/mpeg" />
              Your browser does not support audio.
            </audio>
          </div>
        )}

        {!joined ? (
          <section className="room-entry-section">
            <h3>Join or Create a Private Room</h3>
            <input 
              type="text" 
              placeholder="Room Name" 
              value={room} 
              onChange={(e) => setRoom(e.target.value)} 
              className="input-field" 
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              className="input-field" 
            />
            <div>
              <button onClick={handleCreateRoom} className="btn pad">Create Room</button>
              <button onClick={handleJoinRoom} className="btn">Join Room</button>
            </div>
            {error && <p className="error-message">{error}</p>}
          </section>
        ) : (
          <section className="chat-section">
            <h3>Live Chat – Room: {room}</h3>
            <div className="chat-box">
              {chat.map((msg, index) => (
                <div key={index} className={`chat-message ${msg.sender}`}>
                  {msg.sender === 'system' ? (
                    <div className="system-message">{msg.text}</div>
                  ) : (
                    <>
                      <div className="message-username">{msg.username}</div>
                      <div className="message-text">{msg.text}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                type="text"
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                className="input-field"
              />
              <div className="button-container">
                <button onClick={sendMessage} className="btn">Send</button>
                <button onClick={handleExitRoom} className="btn exit-btn">Exit Room</button>
              </div>
            </div>
          </section>
        )}
      </main>

      <aside className={`songs-sidebar ${showMusicSidebar ? 'open' : ''}`}>
        <h3>Songs 🎶</h3>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search for songs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchSongs()}
            className="input-field"
            onFocus={() => {
              setSearchFocused(true);
              // Ensure music sidebar stays open when searching
              if (window.innerWidth <= 768) {
                setShowMusicSidebar(true);
              }
            }}
            onBlur={() => setSearchFocused(false)}
          />
          <button onClick={searchSongs} className="btn">Search</button>
        </div>
        <ul className="song-list">
          {isSearching && <li className="song-item">🔍 Searching...</li>}
          {!isSearching && searchResults.length === 0 && (
            <li className="song-item">No results found</li>
          )}
          {searchResults.map((song, index) => (
            <li key={index} className="song-item" onClick={() => setCurrentSong(song)}>
              🎵 {song.title} – {song.artist}
            </li>
          ))}
        </ul>
      </aside>
        {!joined && (
        <footer className="chatify-footer">
          <div className="footer-content">
            <span>🔥☕ Made with passion and caffeine by Lakhan Sharan</span>
          </div>
        </footer>
      )}
    </div>
  );
}


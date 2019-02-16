var media = [];
var playlist = [];
var vidId = 0;
var screen;
var kfcDebugMode;
var vidUrl = "http://kfc.uws.al/";
var corsUrl = "https://cors-anywhere.herokuapp.com/";
// var playlistUrl = "https://my-json-server.typicode.com/diamanthaxhimusa/kfcadmin/db";
var playlistUrl = "http://kfc.uws.al/api/v1/screens/";
var vid1 = corsUrl + "https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-only/dash.mpd";
var vid2 = corsUrl + "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd";
var downloadInProgress = false;

function initApp() {
  screen = JSON.parse(localStorage.getItem("kfc_screen"));
  kfcDebugMode = JSON.parse(localStorage.getItem("kfc_debug_mode"));
  if (!screen) {
    window.location.href = window.location.origin;
  }
  dw1 = document.getElementById('download-button');
  dw2 = document.getElementById('dwnbtn');

  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();

  // Check to see if the browser supports the basic APIs Shaka needs.
  if (shaka.Player.isBrowserSupported()) {
    // Everything looks good!
    initPlayer();
  } else {
    // This browser does not have the minimum set of APIs we need.
    log('Browser not supported!', "error");
  }

  // Update the online status and add listeners so that we can visualize
  // our network state to the user.
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

function initPlayer() {
  // Create a Player instance.
  var video = document.getElementById('video');
  var player = new shaka.Player(video);
  var preload = document.getElementById('preload');

  // Attach player and storage to the window to make it easy to access
  // in the JS console and so we can access it in other methods.
  window.player = player;

  // Listen for error events.
  player.addEventListener('error', onErrorEvent);
  video.addEventListener('onended', onEndEvent);
  video.onended = onEndEvent;
  initStorage(player);

  // Update the content list to show what items we initially have
  // stored offline.

  // refreshContentList();

  listContent()
    .then(function (content) {
      if (content.length) {
        media = content;
      }
    });
}

function initPlaylist() {
  log("gettting data");
  if (navigator.onLine) {
    $.ajax({
      url: corsUrl + playlistUrl + screen.screen,
      type: 'GET',
      dataType: 'json',
      success: function(data) {
        var playlistData = data;
        var playlistUpdatedAt = playlistData.updated_at;
        var lastupdated = window.localStorage.getItem('kfc_updated');
        if (lastupdated != playlistUpdatedAt) {
            log("New videos! Downloading now...", "success");
            window.localStorage.setItem('kfc_updated', playlistUpdatedAt);
            donwloadVideos(playlistData.playlist);
        } else {
          log("No new playlist. Playing from cache.", "warning");;
          playFromCache();
        }
      },
      error: function(error) {
        logError(error);
      }
    });  
  } else {
    log("Offline! Loading videos from cache", "warning");
    playFromCache();
  }
}

function getPlaylist() {
  if (navigator.onLine) {
    if (!downloadInProgress) {
      log("Checking for new playlist.");
      $.ajax({
        url: corsUrl + playlistUrl + screen.screen,
        type: 'GET',
        dataType: 'json',
        success: function(data) {
          var playlistData = data;
          var playlistUpdatedAt = playlistData.updated_at;
          var lastupdated = window.localStorage.getItem('kfc_updated');
          if (lastupdated != playlistUpdatedAt) {
              log("New videos! Downloading now...", "success");
              window.localStorage.setItem('kfc_updated', playlistUpdatedAt);
              donwloadVideos(playlistData.playlist);
          } else {
            log("There is no new playlist. Playing the old one");
          }
        },
        error: function(error) {
          log(error, "error");
        }
      });
    }
  } else {
    log("Offline!", "error");
  }
}

function playFromCache() {
  var cachedplaylist = JSON.parse(window.localStorage.getItem("cached_playlist"));
  console.log(cachedplaylist);
  // media = cachedplaylist.playlist;
  window.player.load(media[vidId].offlineUri);
  // preload.src = media[vidId].offlineUri;
}


function offline() {
  log("You are offline!", "error");
}

function online() {
  log("You are back online!", "success");
  // setTimeout(getPlaylist(), 10000);
}

function onEndEvent(event) {
  if (vidId < media.length - 1) {
    vidId++;
  } else {
    vidId = 0;
  }
  window.player.load(media[vidId].offlineUri)
}

function onErrorEvent(event) {
  // Extract the shaka.util.Error object from the event.
  onError(event.detail);
}

function onError(error) {
  // Log the error.
  log('Error code :' + error.code + '; Data:' + error.data, "error");
}

function selectTracks(tracks) {
  // Store the highest bandwidth variant.
  var found = tracks
    .filter(function (track) { return track.type == 'variant'; })
    .sort(function (a, b) { return a.bandwidth - b.bandwidth; })
    .pop();
  log('Offline Track bandwidth: ' + found.bandwidth);
  return [found];
}

function initStorage(player) {
  // Create a storage instance and configure it with optional
  // callbacks. Set the progress callback so that we visualize
  // download progress and override the track selection callback.
  window.storage = new shaka.offline.Storage(player);
  window.storage.configure({
    progressCallback: setDownloadProgress,
    trackSelectionCallback: selectTracks
  });
  window.storage.list().then(function(data){ console.log(data)});
  initPlaylist();
}

function listContent() {
  return window.storage.list();
}

function playContent(content) {
  window.player.load(content.offlineUri);
}

function removeContent(content) {
  return window.storage.remove(content.offlineUri);
}

function downloadContent(manifestUri) {
  // Construct a metadata object to be stored along side the content.
  // This can hold any information the app wants to be stored with the
  // content.
  var metadata = {
    'title': manifestUri,
    'downloaded': Date()
  };

  return window.storage.store(manifestUri, metadata);
}

/*
 * UI callback for when the download button is clicked. This will
 * disable the button while the download is in progress, start the
 * download, and refresh the content list once the download is
 * complete.
 */

function donwloadVideos(playlistArray, index) {
  // Disable the download button to prevent user from requesting
  // another download until this download is complete.
  if (!index) index = 0;
  if (index < playlistArray.length && !downloadInProgress) {
    setDownloadProgress(null, 0);
    var newplaylist = [];
    downloadInProgress = true;
    var url = corsUrl + vidUrl + playlistArray[index];
    console.warn(url);
    downloadLog("Downloading: " + url + "\n Please wait...", "info", true);
    downloadContent(url)
      .then(function (e) {
        downloadLog("Dowloaded! \n" + url + " \n", "success", false);
        newplaylist.push(e);
        window.localStorage.setItem("cached_playlist", JSON.stringify({ playlist: newplaylist }));
        return saveToPlaylist(e);
      })
      .then(function (content) {
        setDownloadProgress(null, 1);
        index = index + 1;
        if (index == playlistArray.length) {
          media = newplaylist;
          log("Playing the new playlist now!", "success");
          player.load(media[vidId].offlineUri);
        } else {
          downloadInProgress = false;
          donwloadVideos(playlistArray, index);
        }
      })
      .catch(function (error) {
        log(error);
        onError(error);
      });
  }
}

// Play the videos of latest playlist
function saveToPlaylist(e) {
  console.log(e);
  return new Promise(function(resolve, reject){ resolve(playlist.push(e)) });
}

/*
 * Update the online status box at the top of the page to tell the
 * user whether or not they have an internet connection.
 */
function updateOnlineStatus() {
  if (navigator.onLine) {
    log("Online", "success");
  } else {
    log("Offline", "error");
  }
}

/*
 * Find our progress bar and set the value to show the progress we
 * have made.
 */
function setDownloadProgress(content, progress) {
  var progressBar = $("#download-progress");
  progressBar.html(Math.round(progress * 100) +'%');
}

/*
 * Clear our content table and repopulate it table with the current
 * list of downloaded content.
 */
function getContentList() {
  return listContent()
    .then(function (content) { 
      console.log(content)
      media.push(content);
    });
};

/*
 * Create a new button but do not add it to the DOM. The caller
 * will need to do that.
 */
function createButton(text, action) {
  var button = document.createElement('button');
  button.innerHTML = text;
  button.onclick = action;
  return button;
}

function logError(message) {
  if (!kfcDebugMode) return;
  toastr.options = {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": false,
    "positionClass": "toast-top-right",
    "preventDuplicates": false,
    "onclick": null,
    "showDuration": "300",
    "hideDuration": "1000",
    "timeOut": "5000",
    "extendedTimeOut": "1000",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
  }
  toastr.error(message);
}

function log(message, type) {
  if (!kfcDebugMode) return;
  if (!type) {
    type = "info"
  }
  toastr[type](message);
}

function downloadLog(message, type, timeOut) {
  if (!kfcDebugMode) return;
  if(!timeOut) {
    toastr.clear();
  }
  if (!type) type = "info";
  if (!timeOut) timeOut = false;
  toastr[type](message + "<br><p><div id='download-progress'></div></p>", "", {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": false,
    "positionClass": "toast-top-right",
    "preventDuplicates": false,
    "onclick": null,
    "escapeHTML": true,
    "showDuration": "300",
    "hideDuration": "1000",
    "timeOut": timeOut ? 0 : "5000",
    "extendedTimeOut": timeOut ? 0 : "1000",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
  });
}

window.setInterval(function () {
  /// call your function here
  getPlaylist();
}, 40000);

// dT = new Date(Date.now() + 1 * 60000) - new Date();
// dT = new Date("Sun Feb 10 2019 14:45:21 GMT+0100 (CET)") - new Date();
// setTimeout(alert, dT, "time's up!")

document.addEventListener('DOMContentLoaded', initApp);
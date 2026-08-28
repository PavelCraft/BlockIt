document.getElementById('reportProblem').addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('feedback.html');
});

document.getElementById('closePage').addEventListener('click', () => window.close());

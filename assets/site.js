/* Carry a campaign tag (?src=conference-name) from the landing page through to
   the flow, so the clinical team can see which event a lead came from.
   Nothing else is tracked — there is no analytics on this site. */
(function () {
  'use strict';
  var q = window.location.search;
  if (!q || q.length < 2) return;
  var links = document.querySelectorAll('a[data-keep-query]');
  for (var i = 0; i < links.length; i++) {
    links[i].href = links[i].getAttribute('href') + q;
  }
})();

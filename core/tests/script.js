alert_event = function(event)
{
  alert("{0} has sent a {1} event"
    .fmt(event.source.localName, event.event_name));
};

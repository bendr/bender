// Bender controllers library

// TODO: clipboard manager
// TODO: command manager
// TODO: selection manager

// A metronome similar to Max or PD
bender.metro = flexo.create_object(bender.controller, {

  // Init the metronome (must be started manually)
  init: function()
  {
    this["rate-ms"] = 1000;
  },

  // Force the metronome to output a bang event
  bang: function()
  {
    bender.notify(this, "@bang");
    this.__next_bang = setTimeout(this.bang.bind(this), this["rate-ms"]);
  },

  // Stop the metronome
  stop: function()
  {
    if (this.__next_bang) clearTimeout(this.__next_bang);
    delete this.__next_bang;
  },

});

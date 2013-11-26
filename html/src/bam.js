(function (bam) {
  "use strict";

  (function () {
    var args = flexo.get_args({ trace: "true" });
    bender.TRACE = flexo.is_true(args.trace);
    bam.env = new bender.Environment();
    if (args.href) {
      bender.render_href(args.href, document.getElementById("render"))
      .then(function (instance) {
        bam.$ = instance;
      }, function (reason) {
        alert(reason && reason.message || reason);
      });
    }
  }());

}(this.bam = {}));

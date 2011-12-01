# Bender
## A declarative Web application framework

Copyright © 2011, [IGEL Co., Ltd.](http://www.igel.co.jp/bender/)


Bender is a declarative framework to build web applications and reusable
components. It is free software and is released under the Apache License v2.0
(see included LICENSE file.) The goal of Bender is to make authoring Web
applications easier through better and higher level abstractions, and being
itself a foundation for more powerful authoring tools.

The Bender framework consists of:

  1. a markup language based on XML for application and component description;
  2. Javascript support libraries;
  3. runtimes for different Web browsers and SVG players.

The design and implementation of Bender are currently evolving very quickly.
When a more stable specification is reached, a component library and authoring
tools will be added.

The basic building block in Bender is the component. Components are meant to be
reusable, composable and extensible. A component has properties, may have a
view describing how it gets rendered, and may be scripted to define its
behavior. Components are defined in terms of other components, and communicate
with each other through events. A Bender application is itself a component.

Here is a simple example application:

  <app xmlns="http://bender.igel.co.jp"
    xmlns:html="http://www.w3.org/1999/xhtml">
    <title>Welcome to Bender!</title>
    <view>
      <html:p>
        Welcome to Bender!
      </html:p>
      <html:p>
        <component href="../lib/button.xml" id="button">Thanks</component>
      </html:p>
    </view>
    <watch>
      <get view="button" event="@pushed">
        alert("You're welcome!");
      </get>
    </watch>
  </app>

See below how to install Bender and run this application.





Install and run Bender

  To install Bender, simply make the contents of this directory accessible
  through a Web server. Then, let $BENDER_HOME be the URL of this directory.
  (Note: you may also run Bender from the file system with Webkit/Safari, but
  this will cause security exceptions in other browsers.)

  To view the documentation, point your browser to $BENDER_HOME. You can run
  Bender applications by pointing your browser to

    $BENDER_HOME/core/bender.html?app=$RELATIVE_PATH

  where $RELATIVE_PATH is the path to your application description file
  relative to this directory. Your file must have a .xml extension, and the
  extension is *NOT* included in the $RELATIVE_PATH. For example, if you add a
  new application `foo.xml` to the apps directory, then $RELATIVE_PATH will be
  apps/foo.xml. See the documentation for some examples.

  For more debug info, you can set the debug flag to true. This will show a
  status indicator and an error message when something goes wrong (and in the
  future filter out debug messages from the console.)

    $BENDER_HOME/core/bender.html?app=$RELATIVE_PATH&debug=1

  You can also use a pure SVG launcher at:

    $BENDER_HOME/core/bender.svg?app=$RELATIVE_PATH

  For more information, please refer to the documentation (in progress) at:

    $BENDER_HOME/doc/index.html

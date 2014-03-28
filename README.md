# Bender; or, a Declarative Language for Web Applications.

Copyright © 2011-2014 [IGEL Co., Ltd.](http://www.igel.co.jp/bender/)

Bender is an experimental, declarative language for Web application authoring.
It is built on top of HTML5, Javascript and XML and focuses on rich graphical
user interfaces. It is free software and is released under the Apache License
v2.0 (see included
[LICENSE](https://github.com/bendr/bender/blob/master/LICENSE) file.)

Bender builds on the idea of declarative languages like HTML, SVG and CSS to
describe not only the layout of an application, but also its structure and its
behavior. The building block of a Bender application is the component, and an
application is described as a hierarchical structure of components, how they
are laid out in relation to each other, and how they interact with each other.
These component descriptions can be built through a Javascript API, or read and
saved in XML. A Bender application is run by loading building its main
component in the Bender runtime, and running in a host application; typically, a
Web browser. The runtime is written in pure Javascript and has no dependency.

Learn more about Bender at
[http://bender.igel.co.jp/](http://bender.igel.co.jp/).

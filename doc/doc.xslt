<xsl:transform version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:html="http://www.w3.org/1999/xhtml" exclude-result-prefixes="html">

  <xsl:output method="html" encoding="utf-8"/>

  <xsl:param name="version" select="'0.9'"/>
  <xsl:param name="date" select="'Mar 2014'"/>

  <xsl:template match="/doc">
    <xsl:text disable-output-escaping="yes">&lt;!DOCTYPE html>&#xa;</xsl:text>
    <html>
      <head>
        <title>
          <xsl:value-of select="title"/>
        </title>
        <link rel="stylesheet" href="doc.css"/>
      </head>
      <body>
        <h1>
          <xsl:apply-templates select="title"/>
        </h1>
        <p class="date">
          <xsl:text>Version </xsl:text>
          <xsl:value-of select="$version"/>
          <xsl:text>, </xsl:text>
          <xsl:value-of select="$date"/>
        </p>
        <xsl:call-template name="toc"/>
        <xsl:apply-templates select="*[not(local-name()='title')]"/>
        <xsl:call-template name="index"/>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="date">
    <p>
      <xsl:value-of select="$date"/>
    </p>
  </xsl:template>

  <xsl:template name="toc">
    <nav>
      <h2>Contents</h2>
      <xsl:call-template name="toc-section"/>
    </nav>
  </xsl:template>

  <xsl:template name="index">
    <nav>
      <h2>Index</h2>
      <p>
        <xsl:for-each select="//def">
          <xsl:sort select="translate(string(),
            'QWERTYUIOPASDFGHJKLZXCVBNM', 'qwertyuiopasdfghjklzxcvbnm')"/>
          <xsl:variable name="def" select="string()"/>
          <xsl:variable name="ref" select="//def[string()=$def]"/>
          <li>
            <a href="#{generate-id()}">
              <xsl:apply-templates/>
            </a>
            <xsl:for-each select="//ref[string()=$def]">
              <xsl:text> </xsl:text>
              <a href="#{generate-id()}">
                ☞
              </a>
            </xsl:for-each>
          </li>
        </xsl:for-each>
      </p>
    </nav>
  </xsl:template>

  <xsl:template name="toc-section">
    <xsl:if test="section">
      <ul>
        <xsl:for-each select="section">
          <li>
            <xsl:variable name="ref">
              <xsl:call-template name="section-id"/>
            </xsl:variable>
            <a href="#{$ref}">
              <xsl:call-template name="section-title"/>
            </a>
            <xsl:call-template name="toc-section"/>
          </li>
        </xsl:for-each>
      </ul>
    </xsl:if>
  </xsl:template>

  <xsl:template name="section-id">
    <xsl:choose>
      <xsl:when test="@id">
        <xsl:value-of select="@id"/>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="generate-id()"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template name="section-title">
    <xsl:number level="multiple"/>
    <xsl:text> </xsl:text>
    <xsl:apply-templates select="title"/>
  </xsl:template>

  <xsl:template match="section">
    <section>
      <xsl:attribute name="id">
        <xsl:call-template name="section-id"/>
      </xsl:attribute>
      <xsl:element name="{concat('h', 1 + count(ancestor-or-self::section))}">
        <xsl:call-template name="section-title"/>
      </xsl:element>
      <xsl:apply-templates select="*[not(local-name()='title')]"/>
    </section>
  </xsl:template>

  <xsl:template match="def">
    <span class="def" id="{generate-id()}">
      <xsl:copy-of select="@*"/>
      <xsl:apply-templates/>
    </span>
  </xsl:template>

  <xsl:template match="ref">
    <a class="ref">
      <xsl:variable name="def" select="string()"/>
      <xsl:variable name="ref" select="//def[string()=$def]"/>
      <xsl:attribute name="href">
        <xsl:value-of select="concat('#', generate-id($ref))"/>
      </xsl:attribute>
      <xsl:copy-of select="@*"/>
      <xsl:apply-templates/>
    </a>
  </xsl:template>

  <xsl:template match="html:*">
    <xsl:element name="{local-name()}">
      <xsl:copy-of select="@*"/>
      <xsl:apply-templates/>
    </xsl:element>
  </xsl:template>

</xsl:transform>

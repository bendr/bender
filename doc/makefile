HTML =	$(patsubst %.xml, %.html, $(wildcard *.xml))

all:	$(HTML)

%.html:	%.xml doc.xslt
	xsltproc --stringparam date "`date +%d\ %b\ %Y`" -o $@ doc.xslt $<

clean:
	$(RM) $(HTML)
